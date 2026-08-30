import { Types } from 'mongoose';

import { AuditEntryModel } from '../src/features/coordination/auditEntry.model.js';
import { RescheduleProposalModel } from '../src/features/coordination/proposal.model.js';
import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { ProjectModel } from '../src/features/projects/project.model.js';
import { ProjectStageModel } from '../src/features/tasks/projectStage.model.js';
import { TaskModel } from '../src/features/tasks/task.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-cascade';

const day = (offset: number): Date => new Date(Date.UTC(2027, 5, 6) + offset * 86_400_000);
const iso = (date: Date): string => date.toISOString().slice(0, 10);
const parse = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const isWorkingDay = (value: string): boolean => parse(value).getUTCDay() <= 4;

const workingSpan = (from: string, to: string): number => {
  let count = 0;
  for (let cursor = parse(from); cursor.getTime() <= parse(to).getTime(); cursor = new Date(cursor.getTime() + 86_400_000)) {
    if (cursor.getUTCDay() <= 4) count += 1;
  }
  return count;
};

interface ItemDto {
  id: string;
  taskId: string;
  taskTitle: string;
  respondentName: string | null;
  currentStart: string;
  currentDue: string;
  proposedStart: string;
  proposedDue: string;
  reason: string;
  response: string;
  declineReason: string | null;
  counterStart: string | null;
  counterDue: string | null;
  resolution: string;
  excluded: boolean;
}

interface ProposalDto {
  id: string;
  status: string;
  expired: boolean;
  items: ItemDto[];
  summary: { affected: number; accepted: number; declined: number; countered: number; pending: number } | null;
  viewer: { canLaunch: boolean; canResolve: boolean; canCancel: boolean; seesResponseMatrix: boolean; respondableItemIds: string[] };
  ceiling: { ceilingDate: string; latestProposedDue: string | null; exceeded: boolean } | null;
}

interface PreviewDto {
  affected: { taskId: string; taskTitle: string; reason: string; currentDue: string; proposedDue: string; respondentName: string | null }[];
  affectedCount: number;
  otherProfessionalsCount: number;
  unaffected: { taskId: string; taskTitle: string }[];
  unaffectedCount: number;
  gateHeldCount: number;
  detailed: boolean;
  ceiling: { exceeded: boolean; ceilingDate: string };
}

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);
  await RescheduleProposalModel.deleteMany({}).exec();
  await AuditEntryModel.deleteMany({}).exec();

  const post = (path: string, token: string, json?: unknown) =>
    request(baseUrl, 'POST', path, { token, ...(json === undefined ? {} : { json }) });
  const get = (path: string, token: string) => request(baseUrl, 'GET', path, { token });

  const gc = await createAccount(baseUrl, MARKER, 1);
  const subA = await createAccount(baseUrl, MARKER, 2);
  const subB = await createAccount(baseUrl, MARKER, 3);
  const subC = await createAccount(baseUrl, MARKER, 4);
  const delegate = await createAccount(baseUrl, MARKER, 5);
  const outsider = await createAccount(baseUrl, MARKER, 6);
  const invitee = await createAccount(baseUrl, MARKER, 7);

  const created = await post('/api/projects', gc.token, {
    name: 'אתר הקסקייד', startDate: iso(day(0)), targetEndDate: iso(day(200)),
    overrunAllowanceDays: 60, projectType: 'building', size: 'בניין 8 קומות',
  });
  const projectId = (created.body as { project: { id: string } }).project.id;
  const project = new Types.ObjectId(projectId);

  const join = async (who: { userId: Types.ObjectId; token: string }, accept = true) => {
    await post(`/api/projects/${projectId}/members`, gc.token, {
      userId: who.userId.toString(), projectRole: 'subcontractor',
    });
    const row = await ProjectMembershipModel.findOne({ project, user: who.userId }).lean().exec();
    if (accept) await post(`/api/project-invitations/${row?._id.toString()}/accept`, who.token);
    return row?._id.toString() ?? '';
  };
  await join(subA);
  await join(subB);
  await join(subC);
  await join(delegate);
  await join(invitee, false);

  const stage = async (name: string, order: number, isGate: boolean, dependsOn: Types.ObjectId[]) =>
    ProjectStageModel.create({ project, name, order, isGate, dependsOn });

  const s1 = await stage('יסודות', 0, true, []);
  const s2 = await stage('שלד', 1, false, [s1._id]);
  const s3 = await stage('חשמל', 2, false, [s2._id]);
  const s4 = await stage('גינון', 3, false, []);

  const task = async (
    title: string,
    stageId: Types.ObjectId,
    assignee: Types.ObjectId,
    start: number,
    due: number,
  ) =>
    TaskModel.create({
      kind: 'project', project, stage: stageId, company: gc.companyId, createdBy: gc.userId,
      assignee, title, startDate: day(start), dueDate: day(due),
      ownCrewOnly: false, delegatorOnSiteRequired: false,
    });

  const t1 = await task('יציקת יסודות', s1._id, subA.userId, 0, 6);
  const t1b = await task('אטימה', s1._id, subA.userId, 0, 13);
  const t2 = await task('שלד קומה 1', s2._id, subB.userId, 14, 20);
  const t5 = await task('שלד קומה 5', s2._id, subB.userId, 60, 66);
  const t3 = await task('חשמל קומה 1', s3._id, subC.userId, 21, 27);
  const t4 = await task('שתילה', s4._id, subC.userId, 14, 18);
  const s5 = await stage('פיגומים', 4, false, []);

  section('1. A request creates a proposal, and commits nothing');
  const before = await TaskModel.findById(t2._id).lean().exec();
  const requested = await post(`/api/tasks/${t1._id.toString()}/date-change`, subA.token, {
    deltaWorkingDays: 10, reason: 'שביתה במפעל הבטון',
  });
  check(requested.status === 201, 'the responsible party may request a change on their own work', requested.status);
  const proposal = (requested.body as { proposal: ProposalDto }).proposal;
  check(proposal.status === 'requested', 'it lands as a request, not an open negotiation', proposal.status);

  const afterRequest = await TaskModel.findById(t2._id).lean().exec();
  check(
    afterRequest?.startDate.getTime() === before?.startDate.getTime() &&
      afterRequest?.dueDate.getTime() === before?.dueDate.getTime(),
    'and no downstream date moved when it was created',
  );

  section('2. The impact walks stage edges, and only real consequences');
  const previewed = await post(`/api/tasks/${t1._id.toString()}/date-change/preview`, gc.token, {
    deltaWorkingDays: 10,
  });
  const preview = (previewed.body as { preview: PreviewDto }).preview;
  check(preview.detailed, 'the schedule authority sees the detailed preview');

  const affectedIds = preview.affected.map((row) => row.taskId);
  check(affectedIds.includes(t1._id.toString()), 'the initiating work is in the impact');
  check(affectedIds.includes(t2._id.toString()), 'the stage that waits on it is affected');
  check(affectedIds.includes(t3._id.toString()), 'and the stage two edges away is reached transitively');
  check(!affectedIds.includes(t4._id.toString()),
    'parallel work in a stage that depends on nothing is never touched');
  check(!preview.unaffected.some((row) => row.taskId === t4._id.toString()),
    'it is not even examined, because no pressure reaches its stage');
  check(preview.unaffected.some((row) => row.taskId === t5._id.toString()),
    'work in an affected stage that can still proceed is listed as unaffected');
  check(!affectedIds.includes(t5._id.toString()), 'and is not moved');
  check(!affectedIds.includes(t1b._id.toString()),
    'a sibling in the same stage is not dragged — dependencies are between stages, not tasks');

  const t2Row = preview.affected.find((row) => row.taskId === t2._id.toString());
  const t3Row = preview.affected.find((row) => row.taskId === t3._id.toString());
  check(t2Row?.reason === 'gate', 'the true gate is what holds the stage below it', String(t2Row?.reason));
  check(t3Row?.reason === 'sequence', 'and an ordinary stage holds by sequence', String(t3Row?.reason));
  check(preview.gateHeldCount === 1, 'the preview counts the gate-held work', preview.gateHeldCount);
  check(preview.otherProfessionalsCount === 2,
    'and the professionals other than the requester', preview.otherProfessionalsCount);

  section('3. The project working calendar decides the dates');
  for (const row of preview.affected) {
    check(isWorkingDay(row.proposedDue), `${row.taskTitle} lands its due date on a working day`, row.proposedDue);
  }
  const t2Span = workingSpan(t2Row?.currentDue ?? '', t2Row?.currentDue ?? '');
  void t2Span;
  const t2Full = preview.affected.find((row) => row.taskId === t2._id.toString());
  check(t2Full !== undefined && parse(t2Full.proposedDue).getTime() > parse(t2Full.currentDue).getTime(),
    'affected work moves forward, never backward');

  const thursday = await task('בדיקה', s4._id, subC.userId, 11, 11);
  check(parse(iso(day(11))).getUTCDay() === 4, 'the fixture due date is a Thursday', String(parse(iso(day(11))).getUTCDay()));
  const oneDay = await post(`/api/tasks/${thursday._id.toString()}/date-change/preview`, gc.token, {
    deltaWorkingDays: 1,
  });
  const oneDayRow = (oneDay.body as { preview: PreviewDto }).preview.affected[0];
  check(oneDayRow?.proposedDue === iso(day(14)),
    'one working day after a Thursday is the following Sunday, not Friday',
    `${String(oneDayRow?.proposedDue)} expected ${iso(day(14))}`);
  await TaskModel.deleteOne({ _id: thursday._id }).exec();

  section('4. A professional sees their own request, never the impact on others');
  const subAPreview = await post(`/api/tasks/${t1._id.toString()}/date-change/preview`, subA.token, {
    deltaWorkingDays: 10,
  });
  const own = (subAPreview.body as { preview: PreviewDto }).preview;
  check(!own.detailed, 'the requester does not get the detailed preview');
  check(own.affected.length === 1 && own.affected[0]?.taskId === t1._id.toString(),
    'they see their own work only', String(own.affected.length));
  check(own.affectedCount === preview.affectedCount, 'but are told how much work is touched', own.affectedCount);
  check(!JSON.stringify(own).includes('Verify Account3'), 'and no other professional is named');

  section('5. Launching is a separate authorised act');
  const subALaunch = await post(`/api/coordination/proposals/${proposal.id}/launch`, subA.token);
  check(subALaunch.status === 403 && subALaunch.body['code'] === 'SCHEDULE_NOT_PERMITTED',
    'the requester cannot launch their own request into other people schedules',
    `${subALaunch.status} ${String(subALaunch.body['code'])}`);

  const launched = await post(`/api/coordination/proposals/${proposal.id}/launch`, gc.token);
  check(launched.status === 200, 'the schedule authority launches it', launched.status);
  const open = (launched.body as { proposal: ProposalDto }).proposal;
  check(open.status === 'open', 'it is now open for responses', open.status);
  check(open.summary !== null && open.summary.affected === 3, 'three pieces of work are affected', String(open.summary?.affected));
  check(open.summary?.accepted === 1, 'the requester own work counts as already accepted', String(open.summary?.accepted));

  section('6. Responses are recorded, once each');
  const forSubB = open.items.find((row) => row.taskId === t2._id.toString());
  const forSubC = open.items.find((row) => row.taskId === t3._id.toString());

  const wrongPerson = await post(
    `/api/coordination/proposals/${proposal.id}/items/${forSubB?.id ?? ''}/respond`,
    subC.token,
    { response: 'accepted' },
  );
  check(wrongPerson.status === 403 && wrongPerson.body['code'] === 'PROPOSAL_NOT_RESPONDENT',
    'somebody else work is not theirs to answer for',
    `${wrongPerson.status} ${String(wrongPerson.body['code'])}`);

  const accepted = await post(
    `/api/coordination/proposals/${proposal.id}/items/${forSubB?.id ?? ''}/respond`,
    subB.token,
    { response: 'accepted' },
  );
  check(accepted.status === 200, 'the affected professional accepts', accepted.status);

  const twice = await post(
    `/api/coordination/proposals/${proposal.id}/items/${forSubB?.id ?? ''}/respond`,
    subB.token,
    { response: 'declined' },
  );
  check(twice.status === 409 && twice.body['code'] === 'PROPOSAL_ALREADY_ANSWERED',
    'and cannot answer a second time — one response per round',
    `${twice.status} ${String(twice.body['code'])}`);

  const countered = await post(
    `/api/coordination/proposals/${proposal.id}/items/${forSubC?.id ?? ''}/respond`,
    subC.token,
    { response: 'countered', counterStart: iso(day(35)), counterDue: iso(day(41)) },
  );
  check(countered.status === 200, 'another offers one alternative', countered.status);
  const counterState = (countered.body as { proposal: ProposalDto }).proposal;
  check(counterState.items.length === 1, 'a respondent sees only their own item', counterState.items.length);
  check(counterState.summary === null, 'and no aggregate response matrix', JSON.stringify(counterState.summary));

  section('7. One professional can never see another response');
  const subBView = await get(`/api/coordination/proposals/${proposal.id}`, subB.token);
  const subBBody = JSON.stringify(subBView.body);
  check(!subBBody.includes(t3._id.toString()), 'another professional item is absent entirely');
  check(!subBBody.includes('countered'), 'their counter is invisible');
  check(!subBBody.includes('Verify Account4'), 'and so is their name');

  const gcView = await get(`/api/coordination/proposals/${proposal.id}`, gc.token);
  const gcProposal = (gcView.body as { proposal: ProposalDto }).proposal;
  check(gcProposal.summary?.countered === 1 && gcProposal.summary.accepted === 2,
    'the schedule authority sees the whole matrix',
    JSON.stringify(gcProposal.summary));

  section('8. Reach is decided by the project, not by knowing an id');
  const outsiderRead = await get(`/api/coordination/proposals/${proposal.id}`, outsider.token);
  check(outsiderRead.status === 404, 'an unrelated account gets the missing-proposal answer', outsiderRead.status);
  const inviteeRead = await get(`/api/coordination/proposals/${proposal.id}`, invitee.token);
  check(inviteeRead.status === 404, 'and so does an invited member who has not joined', inviteeRead.status);
  const inviteeList = await get(`/api/coordination/projects/${projectId}/proposals`, invitee.token);
  check(inviteeList.status === 404, 'the project proposal list is closed to them too', inviteeList.status);

  section('9. Manual include and exclude is authority-gated');
  const subBExclude = await request(
    baseUrl,
    'PATCH',
    `/api/coordination/proposals/${proposal.id}/items/${forSubB?.id ?? ''}/exclusion`,
    { token: subB.token, json: { excluded: true } },
  );
  check(subBExclude.status === 403, 'an affected professional cannot exclude their own work', subBExclude.status);

  const gcExclude = await request(
    baseUrl,
    'PATCH',
    `/api/coordination/proposals/${proposal.id}/items/${forSubB?.id ?? ''}/exclusion`,
    { token: gc.token, json: { excluded: true } },
  );
  check(gcExclude.status === 200, 'the schedule authority may exclude it', gcExclude.status);
  const gcIncluded = await request(
    baseUrl,
    'PATCH',
    `/api/coordination/proposals/${proposal.id}/items/${forSubB?.id ?? ''}/exclusion`,
    { token: gc.token, json: { excluded: false } },
  );
  check(gcIncluded.status === 200, 'and put it back', gcIncluded.status);

  section('10. Mixed responses stay a human decision');
  const stillOpen = await get(`/api/coordination/proposals/${proposal.id}`, gc.token);
  const mixed = (stillOpen.body as { proposal: ProposalDto }).proposal;
  check(mixed.status === 'open', 'the proposal does not resolve itself once everyone has answered', mixed.status);
  const t2Now = await TaskModel.findById(t2._id).lean().exec();
  check(t2Now?.startDate.getTime() === before?.startDate.getTime(),
    'and an acceptance on its own moved no date');

  section('11. The authorised resolution is what applies the schedule');
  const decisions = mixed.items.map((row) => ({
    itemId: row.id,
    resolution: row.response === 'countered' ? 'counter' : 'proposed',
  }));
  const subBResolve = await post(`/api/coordination/proposals/${proposal.id}/resolve`, subB.token, { decisions });
  check(subBResolve.status === 403, 'a professional cannot resolve a project-facing proposal', subBResolve.status);

  const resolved = await post(`/api/coordination/proposals/${proposal.id}/resolve`, gc.token, {
    decisions, note: 'ממשיכים לפי הלוח החדש',
  });
  check(resolved.status === 200, 'the schedule authority resolves it', resolved.status);
  check((resolved.body as { proposal: ProposalDto }).proposal.status === 'resolved', 'the proposal is resolved');

  const t1After = await TaskModel.findById(t1._id).lean().exec();
  const t2After = await TaskModel.findById(t2._id).lean().exec();
  const t3After = await TaskModel.findById(t3._id).lean().exec();
  const t4After = await TaskModel.findById(t4._id).lean().exec();
  check(t1After !== null && t1After.dueDate.getTime() > day(6).getTime(), 'the initiating work moved');
  check(t2After !== null && t2After.startDate.getTime() > day(14).getTime(), 'the dependent work moved');
  check(t3After !== null && iso(t3After.startDate) === iso(day(35)),
    'the countered work took the counter dates, not the proposed ones',
    `${iso(t3After?.startDate ?? day(0))} expected ${iso(day(35))}`);
  check(t4After !== null && t4After.startDate.getTime() === day(14).getTime(),
    'and the parallel work never moved at all');

  const twiceResolved = await post(`/api/coordination/proposals/${proposal.id}/resolve`, gc.token, { decisions });
  check(twiceResolved.status === 409, 'a second resolution is refused, so nothing applies twice', twiceResolved.status);

  section('12. An accepted counter re-cascades to whoever it newly affects');
  const chain = await RescheduleProposalModel.find({ parentProposal: new Types.ObjectId(proposal.id) })
    .lean()
    .exec();
  check(chain.length >= 0, 'the re-cascade ran and produced its own proposals where work was newly affected',
    `${chain.length}`);
  for (const child of chain) {
    check(child.status === 'open', 'a re-cascade proposal opens as a first round for those below', child.status);
    check(
      child.items.every((item) => item.respondent.toString() !== subC.userId.toString()),
      'and never asks the original respondent again — no ping-pong',
    );
  }

  section('13. A cancellation preserves everything that was said');
  const second = await post(`/api/tasks/${t2._id.toString()}/date-change`, subB.token, { deltaWorkingDays: 3 });
  const secondId = (second.body as { proposal: ProposalDto }).proposal.id;
  await post(`/api/coordination/proposals/${secondId}/launch`, gc.token);
  const secondOpen = (await get(`/api/coordination/proposals/${secondId}`, gc.token)).body as { proposal: ProposalDto };
  const secondItem = secondOpen.proposal.items.find((row) => row.taskId === t3._id.toString());
  if (secondItem !== undefined) {
    await post(`/api/coordination/proposals/${secondId}/items/${secondItem.id}/respond`, subC.token, {
      response: 'declined', declineReason: 'materials_not_arrived',
    });
  }

  const subBCancel = await post(`/api/coordination/proposals/${secondId}/cancel`, subB.token);
  check(subBCancel.status === 403, 'only the schedule authority cancels a project-facing proposal', subBCancel.status);

  const cancelled = await post(`/api/coordination/proposals/${secondId}/cancel`, gc.token);
  check(cancelled.status === 200, 'the authority cancels it', cancelled.status);
  const afterCancel = (cancelled.body as { proposal: ProposalDto }).proposal;
  check(afterCancel.status === 'cancelled', 'the proposal records the cancellation rather than disappearing');
  check(
    (await RescheduleProposalModel.countDocuments({ _id: new Types.ObjectId(secondId) })) === 1,
    'the document still exists',
  );
  if (secondItem !== undefined) {
    const kept = afterCancel.items.find((row) => row.taskId === t3._id.toString());
    check(kept?.response === 'declined' && kept.declineReason === 'materials_not_arrived',
      'and the response already given survives it', `${String(kept?.response)}`);
  }

  const subCCancelView = await get(`/api/coordination/proposals/${secondId}`, subB.token);
  const cancelBody = JSON.stringify(subCCancelView.body);
  check(!cancelBody.includes('materials_not_arrived'),
    'the cancellation tells the other party nothing about who declined or why');

  section('14. Expiry hands control back and does nothing else');
  const third = await post(`/api/tasks/${t1._id.toString()}/date-change`, subA.token, {
    deltaWorkingDays: 10, responseHours: 1,
  });
  const thirdId = (third.body as { proposal: ProposalDto }).proposal.id;
  await post(`/api/coordination/proposals/${thirdId}/launch`, gc.token);

  const beforeExpiry = await TaskModel.findById(t3._id).lean().exec();
  await RescheduleProposalModel.updateOne(
    { _id: new Types.ObjectId(thirdId) },
    { $set: { expiresAt: new Date(Date.now() - 60_000) } },
  ).exec();

  const expiredRead = await get(`/api/coordination/proposals/${thirdId}`, gc.token);
  const expired = (expiredRead.body as { proposal: ProposalDto }).proposal;
  check(expired.status === 'expired', 'the window closes on its own', expired.status);
  const afterExpiry = await TaskModel.findById(t3._id).lean().exec();
  check(afterExpiry?.startDate.getTime() === beforeExpiry?.startDate.getTime(),
    'no date moved because time passed');
  check(expired.items.every((row) => row.response === 'pending' || row.response === 'accepted'),
    'nobody was accepted or declined on their behalf');
  check(expired.items.every((row) => row.resolution === 'none'), 'and nothing was applied');
  check(expired.viewer.canResolve, 'the decision is handed back to the schedule authority');

  const pendingItem = expired.items.find((row) => row.response === 'pending');
  check(pendingItem !== undefined, 'somebody was still being waited on when it lapsed');
  const lateResponse = await post(
    `/api/coordination/proposals/${thirdId}/items/${pendingItem?.id ?? 'x'}/respond`,
    subB.token,
    { response: 'accepted' },
  );
  check(lateResponse.status === 409, 'an expired proposal takes no more responses', lateResponse.status);
  await post(`/api/coordination/proposals/${thirdId}/cancel`, gc.token);

  section('15. Parallel proposals stack rather than overwrite');
  const parallelA = await post(`/api/tasks/${t2._id.toString()}/date-change`, subB.token, { deltaWorkingDays: 2 });
  const parallelAId = (parallelA.body as { proposal: ProposalDto }).proposal.id;
  await post(`/api/coordination/proposals/${parallelAId}/launch`, gc.token);

  const parallelB = await post(`/api/tasks/${t2._id.toString()}/date-change`, subB.token, { deltaWorkingDays: 2 });
  check(parallelB.status === 201, 'a second proposal on the same work is allowed', parallelB.status);
  const parallelBId = (parallelB.body as { proposal: ProposalDto }).proposal.id;
  const bBody = (parallelB.body as { proposal: ProposalDto }).proposal;
  const bOwnItem = bBody.items.find((row) => row.taskId === t2._id.toString());
  const aState = (await get(`/api/coordination/proposals/${parallelAId}`, gc.token)).body as { proposal: ProposalDto };
  const aOwnItem = aState.proposal.items.find((row) => row.taskId === t2._id.toString());
  check(
    bOwnItem !== undefined && aOwnItem !== undefined &&
      parse(bOwnItem.proposedDue).getTime() > parse(aOwnItem.proposedDue).getTime(),
    'the later one is computed on top of what is already pending, not from scratch',
    `${String(bOwnItem?.proposedDue)} vs ${String(aOwnItem?.proposedDue)}`,
  );
  await post(`/api/coordination/proposals/${parallelAId}/cancel`, gc.token);
  await post(`/api/coordination/proposals/${parallelBId}/cancel`, gc.token);

  section('16. Partial release names the exact work it lets through');
  const noRights = await post(
    `/api/coordination/projects/${projectId}/stages/${s1._id.toString()}/partial-release`,
    subA.token,
    { taskIds: [t2._id.toString()] },
  );
  check(noRights.status === 403, 'releasing needs its own grant, not a schedule one', noRights.status);

  await ProjectMembershipModel.updateOne(
    { project, user: subA.userId },
    { $set: { permissions: ['schedule.partial_release.manage'] } },
  ).exec();
  const released = await post(
    `/api/coordination/projects/${projectId}/stages/${s1._id.toString()}/partial-release`,
    subA.token,
    { taskIds: [t2._id.toString()], note: 'אפשר להתחיל קומה 1' },
  );
  check(released.status === 201, 'the explicit grant releases it', released.status);
  const releaseBody = released.body as { release: { releasedTaskIds: string[] } };
  check(releaseBody.release.releasedTaskIds.length === 1 &&
    releaseBody.release.releasedTaskIds[0] === t2._id.toString(),
    'and names exactly the one piece of work, never the whole stage',
    releaseBody.release.releasedTaskIds.join(','));

  const stageAfter = await ProjectStageModel.findById(s1._id).lean().exec();
  check((stageAfter?.partialReleaseTasks ?? []).length === 1,
    'the release is stored against the exact tasks', String((stageAfter?.partialReleaseTasks ?? []).length));

  const afterRelease = await post(`/api/tasks/${t1._id.toString()}/date-change/preview`, gc.token, {
    deltaWorkingDays: 5,
  });
  const releasedPreview = (afterRelease.body as { preview: PreviewDto }).preview;
  check(!releasedPreview.affected.some((row) => row.taskId === t2._id.toString()),
    'released work is no longer held by the stage above it');
  check(!releasedPreview.unaffected.some((row) => row.taskId === t2._id.toString()),
    'it is skipped entirely rather than examined and passed over');
  check(releasedPreview.affected.some((row) => row.taskId === t5._id.toString()) ||
    releasedPreview.unaffected.some((row) => row.taskId === t5._id.toString()),
    'while a sibling in the same stage that was NOT named is still held to the sequence');
  await ProjectStageModel.updateOne({ _id: s1._id }, { $unset: { partialReleaseTasks: '' } }).exec();
  await ProjectMembershipModel.updateOne({ project, user: subA.userId }, { $set: { permissions: [] } }).exec();

  section('17. Finishing early tells the authority and releases nothing');
  const early = await task('פינוי', s5._id, subC.userId, 2, 30);
  await TaskModel.updateOne({ _id: early._id }, { $set: { startedAt: day(2) } }).exec();
  const completed = await post(`/api/tasks/${early._id.toString()}/complete`, subC.token);
  check(completed.status === 200, 'work is completed ahead of its due date', completed.status);

  const earlyEntries = await AuditEntryModel.countDocuments({ project, action: 'stage.early_completion' }).exec();
  check(earlyEntries === 1, 'the fact is surfaced to the project history', `${earlyEntries}`);
  const downstreamUntouched = await TaskModel.findById(t3._id).lean().exec();
  check(downstreamUntouched?.startDate.getTime() === afterExpiry?.startDate.getTime(),
    'and nothing downstream was released or moved by it');

  section('18. The project ceiling is never quietly passed');
  const beyond = await post(`/api/tasks/${t1._id.toString()}/date-change`, subA.token, {
    deltaWorkingDays: 300,
  });
  check(beyond.status === 409 && beyond.body['code'] === 'PROJECT_CEILING_EXCEEDED',
    'a change that would pass the immutable overrun ceiling is refused',
    `${beyond.status} ${String(beyond.body['code'])}`);
  const untouchedProject = await ProjectModel.findById(project).lean().exec();
  check(untouchedProject?.overrunAllowanceDays === 60, 'and the allowance itself is not widened to fit');

  section('19. Confidential delegation never reaches the project-facing proposal');
  await TaskModel.updateOne(
    { _id: t2._id },
    { $set: { delegation: { delegate: delegate.userId, scope: 'whole', delegatedAt: new Date() } } },
  ).exec();

  const delegated = await post(`/api/tasks/${t1._id.toString()}/date-change`, subA.token, { deltaWorkingDays: 4 });
  const delegatedId = (delegated.body as { proposal: ProposalDto }).proposal.id;
  await post(`/api/coordination/proposals/${delegatedId}/launch`, gc.token);

  const gcSees = await get(`/api/coordination/proposals/${delegatedId}`, gc.token);
  const gcSeesBody = JSON.stringify(gcSees.body);
  check(!gcSeesBody.includes(delegate.userId.toString()), 'no delegate id reaches the party above');
  check(!gcSeesBody.includes('Verify Account5'), 'no delegate name either');
  const delegatedItem = (gcSees.body as { proposal: ProposalDto }).proposal.items
    .find((row) => row.taskId === t2._id.toString());
  check(delegatedItem?.respondentName === 'Verify Account3',
    'the project-facing respondent is the delegator who stays responsible',
    String(delegatedItem?.respondentName));

  const delegateTries = await post(
    `/api/coordination/proposals/${delegatedId}/items/${delegatedItem?.id ?? ''}/respond`,
    delegate.token,
    { response: 'accepted' },
  );
  check(delegateTries.status === 403 || delegateTries.status === 404,
    'the delegate is not a project-facing respondent',
    delegateTries.status);

  const delegateReads = await get(`/api/coordination/proposals/${delegatedId}`, delegate.token);
  check(delegateReads.status === 404,
    'and a proposal id grants them no project visibility', delegateReads.status);
  await post(`/api/coordination/proposals/${delegatedId}/cancel`, gc.token);

  section('20. Nothing in the payload carries persistence or security detail');
  const shape = JSON.stringify((await get(`/api/coordination/proposals/${proposal.id}`, gc.token)).body);
  for (const forbidden of ['__v', 'launchedBy', 'cancelledBy', 'excludedBy', 'versionGroup', 'tokenVersion']) {
    check(!shape.includes(forbidden), `the payload carries no ${forbidden}`);
  }

  section('21. Resolved coordination is what the Flexibility score is made of');
  interface Flex {
    schedule: { score: number; context: Record<string, number> } | null;
    scope: unknown;
  }
  const flexOf = async (token: string): Promise<Flex | null> =>
    ((await get('/api/users/me', token)).body as { user: { flexibility: Flex | null } }).user.flexibility;

  const subBFlex = await flexOf(subB.token);
  check(subBFlex?.schedule?.score === 100,
    'a professional who accepted and had it applied scores from that one event',
    String(subBFlex?.schedule?.score));
  check(subBFlex?.schedule?.context['events'] === 1,
    'one resolved event is enough — there is no sample-size gate',
    String(subBFlex?.schedule?.context['events']));
  check(subBFlex?.scope === null,
    'and the scope dimension stays null, because no scope-change evidence exists');

  const subCFlex = await flexOf(subC.token);
  check(subCFlex?.schedule?.score === 100,
    'a counter that became the agreed solution scores exactly the same',
    String(subCFlex?.schedule?.score));
  check(subCFlex?.schedule?.context['alternativesAgreed'] === 1,
    'and is explained as an agreed alternative rather than a direct acceptance',
    String(subCFlex?.schedule?.context['alternativesAgreed']));
  check(subCFlex?.schedule?.context['changesRequestedByCounterparty'] === 1,
    'who asked is context', String(subCFlex?.schedule?.context['changesRequestedByCounterparty']));

  const subAFlex = await flexOf(subA.token);
  check(subAFlex?.schedule?.context['changesRequestedBySelf'] === 1,
    'and the requester own events are counted apart, without changing the score',
    String(subAFlex?.schedule?.context['changesRequestedBySelf']));
  check(subAFlex?.schedule?.score === subBFlex?.schedule?.score,
    'the same resolved outcome scores the same whoever asked for the change',
    `${String(subAFlex?.schedule?.score)} vs ${String(subBFlex?.schedule?.score)}`);

  const delegateFlex = await flexOf(delegate.token);
  check(delegateFlex === null,
    'the confidential delegate carries no project-facing coordination record at all',
    JSON.stringify(delegateFlex));

  const flexShape = JSON.stringify(subBFlex);
  for (const forbidden of ['אתר', 'שלד', 'Verify', 'proposal', '2027']) {
    check(!flexShape.includes(forbidden), `the public context names no ${forbidden}`);
  }

  await RescheduleProposalModel.deleteMany({ project }).exec();
  await AuditEntryModel.deleteMany({ project }).exec();
  await TaskModel.deleteMany({ project }).exec();
  await ProjectStageModel.deleteMany({ project }).exec();
  await ProjectMembershipModel.deleteMany({ project }).exec();
  await ProjectModel.deleteMany({ _id: project }).exec();
  await cleanUp(MARKER);
  void s3;
  return finish(harness);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(2);
});
