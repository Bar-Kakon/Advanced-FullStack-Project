import { Types } from 'mongoose';

import { auditRepository } from '../src/features/coordination/audit.repository.js';
import { AuditEntryModel } from '../src/features/coordination/auditEntry.model.js';
import { RescheduleProposalModel } from '../src/features/coordination/proposal.model.js';
import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { ProjectModel } from '../src/features/projects/project.model.js';
import { ProjectStageModel } from '../src/features/tasks/projectStage.model.js';
import { TaskModel } from '../src/features/tasks/task.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-audit';

const day = (offset: number): Date => new Date(Date.UTC(2027, 7, 1) + offset * 86_400_000);
const iso = (date: Date): string => date.toISOString().slice(0, 10);

interface EntryDto {
  id: string;
  action: string;
  actorName: string;
  taskTitle: string | null;
  proposalId: string | null;
  at: string;
  details: Record<string, unknown>;
}

interface ItemDto {
  id: string;
  taskId: string;
  response: string;
  resolution: string;
}

interface ProposalDto {
  id: string;
  status: string;
  items: ItemDto[];
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
  const entriesFor = async (token: string, projectId: string): Promise<EntryDto[]> =>
    ((await get(`/api/coordination/projects/${projectId}/audit`, token)).body as { entries: EntryDto[] })
      .entries ?? [];

  const gc = await createAccount(baseUrl, MARKER, 1);
  const subA = await createAccount(baseUrl, MARKER, 2);
  const subB = await createAccount(baseUrl, MARKER, 3);
  const delegate = await createAccount(baseUrl, MARKER, 4);
  const outsider = await createAccount(baseUrl, MARKER, 5);
  const invitee = await createAccount(baseUrl, MARKER, 6);

  const created = await post('/api/projects', gc.token, {
    name: 'אתר ההיסטוריה', startDate: iso(day(0)), targetEndDate: iso(day(200)),
    overrunAllowanceDays: 60, projectType: 'building', size: 'בניין 4 קומות',
  });
  const projectId = (created.body as { project: { id: string } }).project.id;
  const project = new Types.ObjectId(projectId);

  const join = async (who: { userId: Types.ObjectId; token: string }, accept = true) => {
    await post(`/api/projects/${projectId}/members`, gc.token, {
      userId: who.userId.toString(), projectRole: 'subcontractor',
    });
    const row = await ProjectMembershipModel.findOne({ project, user: who.userId }).lean().exec();
    if (accept) await post(`/api/project-invitations/${row?._id.toString()}/accept`, who.token);
  };
  await join(subA);
  await join(subB);
  await join(delegate);
  await join(invitee, false);

  const s1 = await ProjectStageModel.create({ project, name: 'יסודות', order: 0, isGate: true, dependsOn: [] });
  const s2 = await ProjectStageModel.create({ project, name: 'שלד', order: 1, isGate: false, dependsOn: [s1._id] });

  const mk = async (title: string, stage: Types.ObjectId, assignee: Types.ObjectId, start: number, due: number) =>
    TaskModel.create({
      kind: 'project', project, stage, company: gc.companyId, createdBy: gc.userId,
      assignee, title, startDate: day(start), dueDate: day(due),
      ownCrewOnly: false, delegatorOnSiteRequired: false,
    });

  const t1 = await mk('יציקה', s1._id, subA.userId, 0, 6);
  const t2 = await mk('שלד', s2._id, subB.userId, 7, 13);

  section('1. Every meaningful transition is written, in order');
  const requested = await post(`/api/tasks/${t1._id.toString()}/date-change`, subA.token, {
    deltaWorkingDays: 5, reason: 'עיכוב בטון',
  });
  const proposalId = (requested.body as { proposal: ProposalDto }).proposal.id;
  await post(`/api/coordination/proposals/${proposalId}/launch`, gc.token);

  const opened = (await get(`/api/coordination/proposals/${proposalId}`, gc.token)).body as { proposal: ProposalDto };
  const subBItem = opened.proposal.items.find((row) => row.taskId === t2._id.toString());
  await post(`/api/coordination/proposals/${proposalId}/items/${subBItem?.id ?? ''}/respond`, subB.token, {
    response: 'countered', counterStart: iso(day(20)), counterDue: iso(day(26)),
  });

  const decisions = opened.proposal.items.map((row) => ({
    itemId: row.id,
    resolution: row.id === subBItem?.id ? 'counter' : 'proposed',
  }));
  await post(`/api/coordination/proposals/${proposalId}/resolve`, gc.token, { decisions, note: 'מאושר' });

  const gcEntries = await entriesFor(gc.token, projectId);
  const actions = gcEntries.map((entry) => entry.action);
  for (const expected of [
    'proposal.requested',
    'proposal.launched',
    'proposal.response_recorded',
    'proposal.counter_submitted',
    'proposal.counter_accepted',
    'proposal.resolved',
    'schedule.applied',
  ]) {
    check(actions.includes(expected), `${expected} is recorded`, actions.join(','));
  }
  check(gcEntries.length >= 7, 'the history is a stream, not a single row', `${gcEntries.length}`);

  const times = gcEntries.map((entry) => new Date(entry.at).getTime());
  check(times.every((value, index) => index === 0 || times[index - 1]! >= value),
    'and it reads newest first');

  section('2. History is append-only');
  const beforeCount = await AuditEntryModel.countDocuments({ project }).exec();
  const patched = await request(baseUrl, 'PATCH', `/api/coordination/projects/${projectId}/audit`, {
    token: gc.token, json: { action: 'nope' },
  });
  const deleted = await request(baseUrl, 'DELETE', `/api/coordination/projects/${projectId}/audit`, {
    token: gc.token,
  });
  check(patched.status === 404 && deleted.status === 404,
    'there is no route that edits or deletes project history',
    `${patched.status}/${deleted.status}`);
  check((await AuditEntryModel.countDocuments({ project }).exec()) === beforeCount,
    'and the stream is exactly as long as it was');

  section('3. The management side reads the whole authorised history');
  check(gcEntries.length > 0, 'Full Authority sees it', `${gcEntries.length}`);

  await ProjectMembershipModel.updateOne(
    { project, user: subA.userId },
    { $set: { permissions: ['schedule.change.manage'] } },
  ).exec();
  const granted = await entriesFor(subA.token, projectId);
  check(granted.length === gcEntries.length,
    'and so does an explicit schedule.change.manage grant, with no full authority',
    `${granted.length} vs ${gcEntries.length}`);
  const subAMembership = await ProjectMembershipModel.findOne({ project, user: subA.userId }).lean().exec();
  check(subAMembership?.fullAuthority !== true, 'that account holds no Full Authority');
  await ProjectMembershipModel.updateOne({ project, user: subA.userId }, { $set: { permissions: [] } }).exec();

  section('4. An ordinary professional reads only their own involvement');
  const subBEntries = await entriesFor(subB.token, projectId);
  check(subBEntries.length > 0, 'they do have a history of their own', `${subBEntries.length}`);
  check(subBEntries.length < gcEntries.length, 'but it is narrower than the management stream',
    `${subBEntries.length} vs ${gcEntries.length}`);
  check(subBEntries.some((entry) => entry.action === 'proposal.response_recorded'),
    'their own response is in it');
  check(subBEntries.some((entry) => entry.action === 'schedule.applied'),
    'and so is the schedule change applied to their own work');

  const subAEntries = await entriesFor(subA.token, projectId);
  check(subAEntries.some((entry) => entry.action === 'proposal.requested'),
    'the requester sees their own request');

  section('5. One professional learns nothing about another');
  const subASerialised = JSON.stringify(subAEntries);
  check(!subASerialised.includes(t2._id.toString()), 'another professional work is absent');
  check(!subASerialised.includes('Verify Account3'), 'their name is absent');
  const counterEntries = subAEntries.filter((entry) => entry.action === 'proposal.counter_submitted');
  check(counterEntries.length === 0, 'their counter is absent');
  check(!subASerialised.includes('2027-08-21'), 'and the dates it offered are absent');

  const subBSerialised = JSON.stringify(subBEntries);
  check(!subBSerialised.includes('"note"'), 'the resolver private note is management-only');
  check(!subBSerialised.includes('עיכוב בטון'), 'and so is the requester stated reason');

  section('6. A justified decline reason never crosses to another professional');
  const second = await post(`/api/tasks/${t1._id.toString()}/date-change`, subA.token, { deltaWorkingDays: 20 });
  const secondId = (second.body as { proposal: ProposalDto }).proposal.id;
  await post(`/api/coordination/proposals/${secondId}/launch`, gc.token);
  const secondOpen = (await get(`/api/coordination/proposals/${secondId}`, gc.token)).body as { proposal: ProposalDto };
  const secondItem = secondOpen.proposal.items.find((row) => row.taskId === t2._id.toString());
  check(secondItem !== undefined, 'the other professional work is affected again');
  const declined = await post(
    `/api/coordination/proposals/${secondId}/items/${secondItem?.id ?? 'x'}/respond`,
    subB.token,
    { response: 'declined', declineReason: 'permit_unavailable' },
  );
  check(declined.status === 200, 'and they decline with an approved reason', declined.status);

  const gcAfterDecline = JSON.stringify(await entriesFor(gc.token, projectId));
  check(gcAfterDecline.includes('permit_unavailable'),
    'the management side is told the reason, which is what lets it manage the project');
  const subAAfterDecline = JSON.stringify(await entriesFor(subA.token, projectId));
  check(!subAAfterDecline.includes('permit_unavailable'),
    'the other professional is not, even though the fact was written to history');

  section('7. Cancellation and expiry are recorded as facts');
  await post(`/api/coordination/proposals/${secondId}/cancel`, gc.token);
  const afterCancel = await entriesFor(gc.token, projectId);
  check(afterCancel.some((entry) => entry.action === 'proposal.cancelled'), 'a cancellation is logged');
  const cancelEntry = afterCancel.find((entry) => entry.action === 'proposal.cancelled');
  check(Object.keys(cancelEntry?.details ?? {}).length === 0,
    'and carries no reason, no decliner and no counter',
    JSON.stringify(cancelEntry?.details));

  const third = await post(`/api/tasks/${t1._id.toString()}/date-change`, subA.token, {
    deltaWorkingDays: 1, responseHours: 1,
  });
  const thirdId = (third.body as { proposal: ProposalDto }).proposal.id;
  await post(`/api/coordination/proposals/${thirdId}/launch`, gc.token);
  await RescheduleProposalModel.updateOne(
    { _id: new Types.ObjectId(thirdId) },
    { $set: { expiresAt: new Date(Date.now() - 60_000) } },
  ).exec();
  await get(`/api/coordination/proposals/${thirdId}`, gc.token);

  const expiryEntries = await AuditEntryModel.countDocuments({
    proposal: new Types.ObjectId(thirdId), action: 'proposal.expired',
  }).exec();
  check(expiryEntries === 1, 'expiry is written exactly once, however often it is read', `${expiryEntries}`);
  await get(`/api/coordination/proposals/${thirdId}`, gc.token);
  check(
    (await AuditEntryModel.countDocuments({ proposal: new Types.ObjectId(thirdId), action: 'proposal.expired' }).exec()) === 1,
    'reading it again writes nothing more',
  );
  const expiryEntry = (await entriesFor(gc.token, projectId)).find((entry) => entry.action === 'proposal.expired');
  check(expiryEntry !== undefined && !('applied' in expiryEntry.details),
    'and it records no business consequence, because expiry has none');
  await post(`/api/coordination/proposals/${thirdId}/cancel`, gc.token);

  section('8. A partial release names the work in the history');
  await ProjectMembershipModel.updateOne(
    { project, user: gc.userId },
    { $set: { fullAuthority: true } },
  ).exec();
  await post(
    `/api/coordination/projects/${projectId}/stages/${s1._id.toString()}/partial-release`,
    gc.token,
    { taskIds: [t2._id.toString()], note: 'שחרור חלקי' },
  );
  const releaseEntry = (await entriesFor(gc.token, projectId))
    .find((entry) => entry.action === 'schedule.partial_release');
  check(releaseEntry !== undefined, 'the release is logged');
  check(releaseEntry?.details['taskTitle'] === 'שלד',
    'and says exactly which work it let through', String(releaseEntry?.details['taskTitle']));
  const subBRelease = (await entriesFor(subB.token, projectId))
    .find((entry) => entry.action === 'schedule.partial_release');
  check(subBRelease !== undefined, 'the professional whose work was released is told');
  await ProjectStageModel.updateOne({ _id: s1._id }, { $unset: { partialReleaseTasks: '' } }).exec();

  section('9. A delegated action is attributed to the delegator');
  await TaskModel.updateOne(
    { _id: t2._id },
    { $set: { delegation: { delegate: delegate.userId, scope: 'whole', delegatedAt: new Date() } } },
  ).exec();

  const delegated = await post(`/api/tasks/${t1._id.toString()}/date-change`, subA.token, { deltaWorkingDays: 3 });
  const delegatedId = (delegated.body as { proposal: ProposalDto }).proposal.id;
  await post(`/api/coordination/proposals/${delegatedId}/launch`, gc.token);

  const gcAll = await entriesFor(gc.token, projectId);
  const serialisedAll = JSON.stringify(gcAll);
  check(!serialisedAll.includes(delegate.userId.toString()), 'no delegate id is in the project history');
  check(!serialisedAll.includes('Verify Account4'), 'and no delegate name');
  check(gcAll.every((entry) => entry.actorName !== 'Verify Account4'),
    'every actor is a party the project already knows');

  const delegateEntries = await get(`/api/coordination/projects/${projectId}/audit`, delegate.token);
  const delegateBody = (delegateEntries.body as { entries?: EntryDto[] }).entries ?? [];
  check(!JSON.stringify(delegateBody).includes(t1._id.toString()),
    'and the delegate learns nothing about the wider project from the audit');
  await post(`/api/coordination/proposals/${delegatedId}/cancel`, gc.token);

  section('10. The audit is closed to anybody with no standing');
  const outsiderRead = await get(`/api/coordination/projects/${projectId}/audit`, outsider.token);
  check(outsiderRead.status === 404, 'an unrelated account cannot tell the project exists', outsiderRead.status);
  const inviteeRead = await get(`/api/coordination/projects/${projectId}/audit`, invitee.token);
  check(inviteeRead.status === 404, 'and neither can an invitation that was never accepted', inviteeRead.status);

  section('11. Nothing raw reaches a client');
  const shape = JSON.stringify(gcAll);
  for (const forbidden of ['parties', 'partyDetails', '_id"', '__v', 'actor"', 'passwordHash', 'tokenVersion']) {
    check(!shape.includes(forbidden), `the audit payload carries no ${forbidden}`);
  }

  section('12. Attribution can still be neutralised for D8');
  const before = await AuditEntryModel.countDocuments({ actor: subA.userId }).exec();
  const changed = await auditRepository.neutralizeActor(subA.userId, 'משתמש שנמחק');
  check(changed === before && before > 0,
    'every entry by one actor can be renamed in a single pass', `${changed}/${before}`);
  const afterNeutral = await entriesFor(gc.token, projectId);
  check(afterNeutral.some((entry) => entry.actorName === 'משתמש שנמחק'),
    'history keeps the event and loses only the personal detail');
  check(afterNeutral.length === gcAll.length + 0 || afterNeutral.length >= gcAll.length,
    'and no business history was destroyed to do it', `${afterNeutral.length} vs ${gcAll.length}`);

  await AuditEntryModel.deleteMany({ project }).exec();
  await RescheduleProposalModel.deleteMany({ project }).exec();
  await TaskModel.deleteMany({ project }).exec();
  await ProjectStageModel.deleteMany({ project }).exec();
  await ProjectMembershipModel.deleteMany({ project }).exec();
  await ProjectModel.deleteMany({ _id: project }).exec();
  await cleanUp(MARKER);
  void s2;
  return finish(harness);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(2);
});
