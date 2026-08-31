import { Types } from 'mongoose';

import { AuditEntryModel } from '../src/features/coordination/auditEntry.model.js';
import { buildCoordinationService } from '../src/features/coordination/coordination.module.js';
import { WorkHandoffModel } from '../src/features/coordination/handoff.model.js';
import { createTransferWorker } from '../src/features/coordination/responsibilityTransfer.worker.js';
import { RescheduleProposalModel } from '../src/features/coordination/proposal.model.js';
import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { ProjectModel } from '../src/features/projects/project.model.js';
import { ProjectStageModel } from '../src/features/tasks/projectStage.model.js';
import { TaskModel } from '../src/features/tasks/task.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-handoff';
const iso = (offset: number): string =>
  new Date(Date.UTC(2027, 10, 7) + offset * 86_400_000).toISOString().slice(0, 10);

interface HandoffDto {
  id: string;
  taskId: string;
  kind: string;
  state: string;
  fromName: string | null;
  toName: string | null;
  completedWorkAtHandover: string;
  viewerDecides: boolean;
}

interface Flex {
  schedule: { score: number; context: Record<string, number> } | null;
}

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);
  await WorkHandoffModel.deleteMany({}).exec();
  await RescheduleProposalModel.deleteMany({}).exec();
  await AuditEntryModel.deleteMany({}).exec();

  const post = (path: string, token: string, json?: unknown) =>
    request(baseUrl, 'POST', path, { token, ...(json === undefined ? {} : { json }) });
  const get = (path: string, token: string) => request(baseUrl, 'GET', path, { token });

  const gc = await createAccount(baseUrl, MARKER, 1);
  const subA = await createAccount(baseUrl, MARKER, 2);
  const subB = await createAccount(baseUrl, MARKER, 3);
  const delegate = await createAccount(baseUrl, MARKER, 4);
  const outsider = await createAccount(baseUrl, MARKER, 5);
  const stranger = await createAccount(baseUrl, MARKER, 6);
  const joiner = await createAccount(baseUrl, MARKER, 7);

  const created = await post('/api/projects', gc.token, {
    name: 'אתר ההעברה', startDate: iso(0), targetEndDate: iso(150),
    overrunAllowanceDays: 40, projectType: 'building', size: 'בניין 5 קומות',
  });
  const projectId = (created.body as { project: { id: string } }).project.id;
  const project = new Types.ObjectId(projectId);

  const join = async (who: { userId: Types.ObjectId; token: string }) => {
    await post(`/api/projects/${projectId}/members`, gc.token, {
      userId: who.userId.toString(), projectRole: 'subcontractor',
    });
    const row = await ProjectMembershipModel.findOne({ project, user: who.userId }).lean().exec();
    await post(`/api/project-invitations/${row?._id.toString()}/accept`, who.token);
  };
  await join(subA);
  await join(subB);
  await join(delegate);

  const stage = await ProjectStageModel.create({ project, name: 'שלד', order: 0, isGate: false, dependsOn: [] });
  const mk = async (title: string, assignee: Types.ObjectId) =>
    TaskModel.create({
      kind: 'project', project, stage: stage._id, company: gc.companyId, createdBy: gc.userId,
      assignee, title, startDate: new Date(iso(1)), dueDate: new Date(iso(9)),
      ownCrewOnly: false, delegatorOnSiteRequired: false,
    });

  const t1 = await mk('טיח', subA.userId);
  const t2 = await mk('צנרת', subA.userId);

  section('1. A handover must record what was already done');
  const noRecord = await post(`/api/coordination/tasks/${t1._id.toString()}/handoff`, gc.token, {
    toUserId: subB.userId.toString(), completedWorkAtHandover: '   ',
  });
  check(noRecord.status === 400,
    'a handover with no completion record is refused', noRecord.status);

  section('2. The authority opens it and the incoming party decides');
  const opened = await post(`/api/coordination/tasks/${t1._id.toString()}/handoff`, gc.token, {
    toUserId: subB.userId.toString(), completedWorkAtHandover: 'טיח הושלם עד קומה 2',
  });
  check(opened.status === 201, 'the schedule authority opens the handover', opened.status);
  const handoff = (opened.body as { handoff: HandoffDto }).handoff;
  check(handoff.state === 'proposed', 'it waits on an answer rather than transferring at once', handoff.state);
  check(handoff.completedWorkAtHandover === 'טיח הושלם עד קומה 2',
    'and it carries what had already been done', handoff.completedWorkAtHandover);

  const stillSubA = await TaskModel.findById(t1._id).lean().exec();
  check(stillSubA?.assignee?.toString() === subA.userId.toString(),
    'responsibility has not moved yet');

  const secondOpen = await post(`/api/coordination/tasks/${t1._id.toString()}/handoff`, gc.token, {
    toUserId: subB.userId.toString(), completedWorkAtHandover: 'שוב',
  });
  check(secondOpen.status === 409, 'a second open handover on the same work is refused', secondOpen.status);

  const wrongDecider = await post(`/api/coordination/handoffs/${handoff.id}/decision`, subA.token, {
    accept: true,
  });
  check(wrongDecider.status === 403,
    'the outgoing party cannot accept on the incoming party behalf', wrongDecider.status);
  const authorityDecider = await post(`/api/coordination/handoffs/${handoff.id}/decision`, gc.token, {
    accept: true,
  });
  check(authorityDecider.status === 403,
    'and neither can the authority that opened it — consent is the incoming party own',
    authorityDecider.status);

  section('3. Acceptance is what actually moves responsibility');
  const accepted = await post(`/api/coordination/handoffs/${handoff.id}/decision`, subB.token, {
    accept: true,
  });
  check(accepted.status === 200, 'the incoming party accepts', accepted.status);

  const moved = await TaskModel.findById(t1._id).lean().exec();
  check(moved?.assignee?.toString() === subB.userId.toString(),
    'the authoritative responsible party is now the replacement',
    String(moved?.assignee?.toString()));
  check(moved?.previousAssignee?.toString() === subA.userId.toString(),
    'and who it was before is preserved', String(moved?.previousAssignee?.toString()));

  const twice = await post(`/api/coordination/handoffs/${handoff.id}/decision`, subB.token, { accept: true });
  check(twice.status === 404, 'accepting twice changes nothing', twice.status);
  check((await WorkHandoffModel.countDocuments({ task: t1._id, state: 'accepted' })) === 1,
    'exactly one accepted handover exists for that work');

  const entries = await AuditEntryModel.find({ project, action: { $in: ['work.handoff_initiated', 'work.handoff_accepted'] } })
    .lean()
    .exec();
  check(entries.length === 2, 'both the offer and the acceptance are in the project history', `${entries.length}`);

  section('4. A declined handover leaves responsibility where it was');
  const second = await post(`/api/coordination/tasks/${t2._id.toString()}/handoff`, gc.token, {
    toUserId: subB.userId.toString(), completedWorkAtHandover: 'צנרת קומה 1',
  });
  const secondId = (second.body as { handoff: HandoffDto }).handoff.id;
  const declined = await post(`/api/coordination/handoffs/${secondId}/decision`, subB.token, { accept: false });
  check(declined.status === 200, 'the incoming party may decline', declined.status);
  const unmovedTask = await TaskModel.findById(t2._id).lean().exec();
  check(unmovedTask?.assignee?.toString() === subA.userId.toString(),
    'and responsibility stays exactly where it was');

  section('5. A confidential delegate becomes project-facing only when the delegator says so');
  await TaskModel.updateOne(
    { _id: t2._id },
    { $set: { delegation: { delegate: delegate.userId, scope: 'whole', delegatedAt: new Date() } } },
  ).exec();

  const delegateOpens = await post(`/api/coordination/tasks/${t2._id.toString()}/handoff`, delegate.token, {
    toUserId: subB.userId.toString(), completedWorkAtHandover: 'x',
  });
  check(delegateOpens.status === 403,
    'the confidential delegate cannot hand the work on themselves', delegateOpens.status);

  const disclosure = await post(`/api/coordination/tasks/${t2._id.toString()}/handoff`, subA.token, {
    toUserId: delegate.userId.toString(), completedWorkAtHandover: 'צנרת עד קומה 3',
  });
  check(disclosure.status === 201,
    'but the responsible party may disclose them and offer the transfer', disclosure.status);
  const disclosed = (disclosure.body as { handoff: HandoffDto }).handoff;
  check(disclosed.kind === 'delegation_disclosure',
    'and it is recorded as a disclosure, not an ordinary replacement', disclosed.kind);

  const beforeAccept = await TaskModel.findById(t2._id).lean().exec();
  check(beforeAccept?.delegation !== undefined,
    'until it is accepted the delegation still stands and nothing is public');

  const delegateAccepts = await post(`/api/coordination/handoffs/${disclosed.id}/decision`, delegate.token, {
    accept: true,
  });
  check(delegateAccepts.status === 403,
    'the disclosure is answered by the authority, not by the delegate', delegateAccepts.status);

  const authorityAccepts = await post(`/api/coordination/handoffs/${disclosed.id}/decision`, gc.token, {
    accept: true,
  });
  check(authorityAccepts.status === 200, 'the authority accepts the transfer', authorityAccepts.status);

  const transferred = await TaskModel.findById(t2._id).lean().exec();
  check(transferred?.assignee?.toString() === delegate.userId.toString(),
    'responsibility is now genuinely theirs');
  check(transferred?.delegation === undefined,
    'and the confidential arrangement is gone, because it is no longer confidential');

  section('6. A delegate who is not on the project joins before responsibility moves');
  const t4 = await mk('חשמל', subA.userId);
  await TaskModel.updateOne(
    { _id: t4._id },
    { $set: { delegation: { delegate: stranger.userId, scope: 'whole', delegatedAt: new Date() } } },
  ).exec();

  const wrongTarget = await post(`/api/coordination/tasks/${t4._id.toString()}/handoff`, subA.token, {
    toUserId: subB.userId.toString(), completedWorkAtHandover: 'x',
  });
  check(wrongTarget.status === 403,
    'the responsible party may disclose their own delegate and nobody else', wrongTarget.status);

  const idFree = await post(`/api/coordination/tasks/${t4._id.toString()}/handoff`, subA.token, {
    completedWorkAtHandover: 'חשמל עד קומה 1',
  });
  check(idFree.status === 201,
    'disclosure needs no id at all — the server resolves the delegator own delegate', idFree.status);
  const idFreeHandoff = (idFree.body as { handoff: HandoffDto }).handoff;
  check(idFreeHandoff.kind === 'delegation_disclosure',
    'and it is a disclosure', idFreeHandoff.kind);

  const held = await post(`/api/coordination/handoffs/${idFreeHandoff.id}/decision`, gc.token, {
    accept: true,
  });
  check(held.status === 200, 'the authority accepts the transfer', held.status);
  check((held.body as { handoff: HandoffDto }).handoff.state === 'awaiting_membership',
    'but the transfer waits, because the incoming party is not on the project',
    (held.body as { handoff: HandoffDto }).handoff.state);

  const heldTask = await TaskModel.findById(t4._id).lean().exec();
  check(heldTask?.assignee?.toString() === subA.userId.toString(),
    'responsibility has not moved on the authority word alone');
  check(heldTask?.delegation !== undefined,
    'and the delegation is still standing, so nothing became public');

  const invitation = await ProjectMembershipModel.findOne({ project, user: stranger.userId }).lean().exec();
  check(invitation?.status === 'invited',
    'an invitation was created for them instead', String(invitation?.status));
  check((invitation?.permissions ?? []).length === 0 && invitation?.fullAuthority === false,
    'carrying no authority of its own');

  const heldPending = (await get('/api/coordination/pending-actions', gc.token)).body as {
    totals: { handoffs: number };
  };
  check(heldPending.totals.handoffs === 0,
    'management owes nothing while the invitation is out', String(heldPending.totals.handoffs));

  const refused = await post(`/api/project-invitations/${invitation?._id.toString()}/decline`, stranger.token);
  check(refused.status === 204 || refused.status === 200,
    'the incoming party may refuse to join', refused.status);
  check((await WorkHandoffModel.findById(idFreeHandoff.id).lean().exec())?.state === 'declined',
    'and refusing the invitation is refusing the transfer');
  const refusedTask = await TaskModel.findById(t4._id).lean().exec();
  check(refusedTask?.assignee?.toString() === subA.userId.toString(),
    'so responsibility stayed with the delegator');
  check(refusedTask?.delegation !== undefined, 'and the delegation is untouched');

  const again = await post(`/api/coordination/tasks/${t4._id.toString()}/handoff`, subA.token, {
    completedWorkAtHandover: 'חשמל עד קומה 1',
  });
  const againId = (again.body as { handoff: HandoffDto }).handoff.id;
  await post(`/api/coordination/handoffs/${againId}/decision`, gc.token, { accept: true });
  const reissued = await ProjectMembershipModel.findOne({ project, user: stranger.userId }).lean().exec();
  check(reissued?.status === 'invited', 'a refused offer can be made again', String(reissued?.status));

  const joined = await post(`/api/project-invitations/${reissued?._id.toString()}/accept`, stranger.token);
  check(joined.status === 204 || joined.status === 200, 'this time they join', joined.status);
  check((await WorkHandoffModel.findById(againId).lean().exec())?.state === 'accepted',
    'and joining is the third consent that completes the transfer');

  const finallyMoved = await TaskModel.findById(t4._id).lean().exec();
  check(finallyMoved?.assignee?.toString() === stranger.userId.toString(),
    'responsibility is now theirs', String(finallyMoved?.assignee?.toString()));
  check(finallyMoved?.previousAssignee?.toString() === subA.userId.toString(),
    'and who carried it before is preserved');
  check(finallyMoved?.delegation === undefined,
    'the confidential arrangement is gone, because it is no longer confidential');
  check((await ProjectMembershipModel.findOne({ project, user: stranger.userId }).lean().exec())?.status === 'active',
    'and they hold a real membership rather than an implied one');

  section('7. The screen is told which path it may offer, never a raw id');
  const gcView = (await get(`/api/coordination/tasks/${t1._id.toString()}/handoff`, gc.token)).body as {
    mode: string | null; delegateName: string | null; currentAssigneeId: string | null;
  };
  check(gcView.mode === 'authority', 'management is offered the authority path', String(gcView.mode));
  check(gcView.currentAssigneeId === subB.userId.toString(),
    'and told who currently holds it, so the picker can leave them out');
  check(gcView.delegateName === null, 'management is never told of a delegate here');

  const plainView = (await get(`/api/coordination/tasks/${t1._id.toString()}/handoff`, subB.token)).body as {
    mode: string | null;
  };
  check(plainView.mode === null,
    'a responsible party with no delegate is offered no handover at all', String(plainView.mode));

  const t5 = await mk('ריצוף', subA.userId);
  await TaskModel.updateOne(
    { _id: t5._id },
    { $set: { delegation: { delegate: delegate.userId, scope: 'whole', delegatedAt: new Date() } } },
  ).exec();
  const delegatorView = (await get(`/api/coordination/tasks/${t5._id.toString()}/handoff`, subA.token)).body as {
    mode: string | null; delegateName: string | null;
  };
  check(delegatorView.mode === 'disclosure',
    'the delegator is offered disclosure instead', String(delegatorView.mode));
  check(delegatorView.delegateName !== null && delegatorView.delegateName !== '',
    'named, because they chose that person themselves', String(delegatorView.delegateName));

  const delegateOwnView = (await get(`/api/coordination/tasks/${t5._id.toString()}/handoff`, delegate.token)).body as {
    mode: string | null;
  };
  check(delegateOwnView.mode === null,
    'and the delegate is offered nothing — a delegate hands nothing on', String(delegateOwnView.mode));

  const stuck = await post(`/api/coordination/tasks/${t5._id.toString()}/handoff`, subA.token, {
    completedWorkAtHandover: 'ריצוף חדר אחד',
  });
  const stuckId = (stuck.body as { handoff: HandoffDto }).handoff.id;
  await WorkHandoffModel.updateOne(
    { _id: new Types.ObjectId(stuckId) },
    { $set: { state: 'awaiting_membership' } },
  ).exec();
  const repaired = (await get(`/api/coordination/tasks/${t5._id.toString()}/handoff`, gc.token)).body as {
    handoff: HandoffDto | null;
  };
  check(repaired.handoff === null,
    'a transfer left waiting on somebody who is already a member completes on the next read',
    JSON.stringify(repaired.handoff));
  check((await WorkHandoffModel.findById(stuckId).lean().exec())?.state === 'accepted',
    'so a failure between joining and transferring cannot strand responsibility');
  check((await TaskModel.findById(t5._id).lean().exec())?.assignee?.toString() === delegate.userId.toString(),
    'and responsibility really did move');

  section('8. An approved transfer completes on its own, without anybody opening the work');
  const worker = createTransferWorker(buildCoordinationService());

  const t6 = await mk('גבס', subA.userId);
  await TaskModel.updateOne(
    { _id: t6._id },
    { $set: { delegation: { delegate: joiner.userId, scope: 'whole', delegatedAt: new Date() } } },
  ).exec();
  const offered = await post(`/api/coordination/tasks/${t6._id.toString()}/handoff`, subA.token, {
    completedWorkAtHandover: 'גבס בקומה 1',
  });
  const heldId = (offered.body as { handoff: HandoffDto }).handoff.id;
  await post(`/api/coordination/handoffs/${heldId}/decision`, gc.token, { accept: true });

  const waitSweep = await worker.runOnce();
  check(waitSweep.waiting === 1 && waitSweep.completed === 0,
    'an unanswered invitation is left alone rather than forced', JSON.stringify(waitSweep));
  const afterOne = await WorkHandoffModel.findById(heldId).lean().exec();
  check(afterOne?.state === 'awaiting_membership', 'the transfer is still waiting on the person');
  check((afterOne?.completionAttempts ?? 0) === 1,
    'and the attempt is recorded on the row itself', String(afterOne?.completionAttempts));

  await worker.runOnce();
  const afterTwo = await WorkHandoffModel.findById(heldId).lean().exec();
  check((afterTwo?.completionAttempts ?? 0) === 2,
    'a second sweep tries again — this is a retry, not one chance',
    String(afterTwo?.completionAttempts));
  check((await TaskModel.findById(t6._id).lean().exec())?.delegation !== undefined,
    'the delegation stays confidential for as long as the transfer is unfinished');

  const invited = await ProjectMembershipModel.findOne({ project, user: joiner.userId }).lean().exec();
  await ProjectMembershipModel.updateOne(
    { _id: invited?._id },
    { $set: { status: 'active', respondedAt: new Date() } },
  ).exec();
  check((await WorkHandoffModel.findById(heldId).lean().exec())?.state === 'awaiting_membership',
    'the invitation is answered, and the immediate consumer never ran');

  const settleSweep = await worker.runOnce();
  check(settleSweep.completed === 1,
    'the durable retry settles it with no request and no screen involved', JSON.stringify(settleSweep));
  check((await WorkHandoffModel.findById(heldId).lean().exec())?.state === 'accepted',
    'the handover is accepted');
  const sweptTask = await TaskModel.findById(t6._id).lean().exec();
  check(sweptTask?.assignee?.toString() === joiner.userId.toString(),
    'responsibility moved without anybody reading the work', String(sweptTask?.assignee?.toString()));
  check(sweptTask?.delegation === undefined,
    'and the delegation is cleared exactly as on the direct path');

  const repeatSweep = await worker.runOnce();
  check(repeatSweep.examined === 0 && repeatSweep.completed === 0,
    'a repeated sweep finds nothing left to do', JSON.stringify(repeatSweep));
  check((await AuditEntryModel.countDocuments({ task: t6._id, action: 'work.handoff_accepted' })) === 1,
    'so a retried completion records one transfer, never two');

  section('9. Somebody with no standing reaches none of it');
  const outsiderRead = await get(`/api/coordination/tasks/${t1._id.toString()}/handoff`, outsider.token);
  check(outsiderRead.status === 404, 'an unrelated account cannot read a handover', outsiderRead.status);
  const outsiderOpen = await post(`/api/coordination/tasks/${t1._id.toString()}/handoff`, outsider.token, {
    toUserId: subB.userId.toString(), completedWorkAtHandover: 'x',
  });
  check(outsiderOpen.status === 404, 'nor open one', outsiderOpen.status);

  const strangerTarget = await post(`/api/coordination/tasks/${t1._id.toString()}/handoff`, gc.token, {
    toUserId: outsider.userId.toString(), completedWorkAtHandover: 'x',
  });
  check(strangerTarget.status === 409,
    'and work cannot be handed to somebody who is not on the project', strangerTarget.status);

  section('9. Replacement scores only once the responsibility really moved');
  const t3 = await mk('איטום', subA.userId);
  const proposal = await post(`/api/tasks/${t3._id.toString()}/date-change`, subA.token, {
    deltaWorkingDays: 3,
  });
  const proposalId = (proposal.body as { proposal: { id: string; items: { id: string; taskId: string }[] } }).proposal;
  await post(`/api/coordination/proposals/${proposalId.id}/launch`, gc.token);

  const opened3 = (await get(`/api/coordination/proposals/${proposalId.id}`, gc.token)).body as {
    proposal: { items: { id: string; taskId: string }[] };
  };
  const ownItem = opened3.proposal.items.find((row) => row.taskId === t3._id.toString());
  await post(`/api/coordination/proposals/${proposalId.id}/resolve`, gc.token, {
    decisions: [{ itemId: ownItem?.id ?? '', resolution: 'replaced' }],
  });

  const flexOf = async (token: string): Promise<Flex | null> =>
    ((await get('/api/users/me', token)).body as { user: { flexibility: Flex | null } }).user.flexibility;

  const beforeHandoff = await flexOf(subA.token);
  check(beforeHandoff === null,
    'a resolution that only says "replaced" produces no Flexibility event on its own',
    JSON.stringify(beforeHandoff));

  const forReal = await post(`/api/coordination/tasks/${t3._id.toString()}/handoff`, gc.token, {
    toUserId: subB.userId.toString(), completedWorkAtHandover: 'איטום לא התחיל',
  });
  const forRealId = (forReal.body as { handoff: HandoffDto }).handoff.id;
  await post(`/api/coordination/handoffs/${forRealId}/decision`, subB.token, { accept: true });

  const afterHandoff = await flexOf(subA.token);
  check(afterHandoff?.schedule !== null && afterHandoff?.schedule !== undefined,
    'once the replacement really happened the event exists',
    JSON.stringify(afterHandoff));
  check(afterHandoff?.schedule?.context['unresolvedFailures'] === 1,
    'and it is counted as the unresolved failure it is',
    String(afterHandoff?.schedule?.context['unresolvedFailures']));
  check(afterHandoff?.schedule?.score === 0,
    'the score reflects it', String(afterHandoff?.schedule?.score));

  const replacementFlex = await flexOf(subB.token);
  check(replacementFlex === null,
    'and the incoming party carries no outcome merely for taking the work on',
    JSON.stringify(replacementFlex));

  await WorkHandoffModel.deleteMany({ project }).exec();
  await RescheduleProposalModel.deleteMany({ project }).exec();
  await AuditEntryModel.deleteMany({ project }).exec();
  await TaskModel.deleteMany({ project }).exec();
  await ProjectStageModel.deleteMany({ project }).exec();
  await ProjectMembershipModel.deleteMany({ project }).exec();
  await ProjectModel.deleteMany({ _id: project }).exec();
  await cleanUp(MARKER);
  return finish(harness);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(2);
});
