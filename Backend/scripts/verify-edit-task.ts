/**
 * Edit Task, and the one rule the whole feature exists to hold: a committed date on project work
 * is never written by an edit.
 *
 *   npm run verify:edit-task
 */
import { Types } from 'mongoose';

import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { ProjectStageModel } from '../src/features/tasks/projectStage.model.js';
import { TaskModel } from '../src/features/tasks/task.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-edit-task';
const iso = (offset: number): string =>
  new Date(Date.UTC(2027, 9, 3) + offset * 86_400_000).toISOString().slice(0, 10);

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);

  const post = (path: string, token: string, json?: unknown) =>
    request(baseUrl, 'POST', path, { token, ...(json === undefined ? {} : { json }) });
  const get = (path: string, token: string) => request(baseUrl, 'GET', path, { token });
  const patch = (path: string, token: string, json: unknown) =>
    request(baseUrl, 'PATCH', path, { token, json });

  const gc = await createAccount(baseUrl, MARKER, 1);
  const sub = await createAccount(baseUrl, MARKER, 2);
  const outsider = await createAccount(baseUrl, MARKER, 3);

  const created = await post('/api/projects', gc.token, {
    name: 'אתר העריכה', startDate: iso(0), targetEndDate: iso(120),
    overrunAllowanceDays: 30, projectType: 'building', size: 'בניין 3 קומות',
  });
  const projectId = (created.body as { project: { id: string } }).project.id;
  const project = new Types.ObjectId(projectId);

  const join = async (who: { userId: Types.ObjectId; token: string }) => {
    await post(`/api/projects/${projectId}/members`, gc.token, {
      userId: who.userId.toString(), projectRole: 'subcontractor',
    });
    const row = await ProjectMembershipModel.findOne({ project, user: who.userId }).lean().exec();
    await post(`/api/project-invitations/${row?._id.toString()}/accept`, who.token);
    return row;
  };
  await join(sub);

  const stage = await ProjectStageModel.create({
    project, name: 'שלד', order: 0, isGate: false, dependsOn: [],
  });
  const second = await ProjectStageModel.create({
    project, name: 'גמר', order: 1, isGate: false, dependsOn: [stage._id],
  });

  const task = await TaskModel.create({
    kind: 'project', project, stage: stage._id, company: gc.companyId, createdBy: gc.userId,
    assignee: sub.userId, title: 'יציקה', description: 'תיאור מקורי',
    startDate: new Date(iso(5)), dueDate: new Date(iso(9)),
    ownCrewOnly: false, delegatorOnSiteRequired: false,
  });
  const taskId = task._id.toString();

  section('1. The editable-fields read answers before a form is drawn');
  const editable = await get(`/api/tasks/${taskId}/editable`, gc.token);
  const fields = (editable.body as { editable: Record<string, boolean> }).editable;
  check(editable.status === 200, 'the creator reads what may be edited', editable.status);
  check(fields['canEditDetails'] === true, 'and may edit the details of work they opened');
  check(fields['canEditDatesDirectly'] === false, 'but never the dates directly');
  check(fields['datesGoThroughProposal'] === true,
    'and is told the dates belong to the proposal flow');

  section('2. Non-schedule fields are edited directly');
  const edited = await patch(`/api/tasks/${taskId}`, gc.token, {
    title: 'יציקת קומה א', description: 'תיאור מעודכן', ownCrewOnly: true,
  });
  const body = (edited.body as { task: Record<string, unknown> }).task;
  check(edited.status === 200, 'the edit is accepted', edited.status);
  check(body['title'] === 'יציקת קומה א', 'the title changed', body['title']);
  check(body['ownCrewOnly'] === true, 'and so did the own-crew term');

  const clearing = await patch(`/api/tasks/${taskId}`, gc.token, { description: null });
  check((clearing.body as { task: { description: null } }).task.description === null,
    'null clears the description rather than storing a blank one');

  section('3. A schedule-affecting date is refused and sent to the proposal');
  const movedStart = await patch(`/api/tasks/${taskId}`, gc.token, { startDate: iso(20) });
  check(movedStart.status === 409, 'moving a start date is refused', movedStart.status);
  check((movedStart.body as { code?: string }).code === 'TASK_EDIT_DATES_NEED_PROPOSAL',
    'and the answer names the proposal flow rather than a permission',
    JSON.stringify(movedStart.body));

  const movedDue = await patch(`/api/tasks/${taskId}`, gc.token, { dueDate: iso(30) });
  check(movedDue.status === 409, 'and so is moving a due date', movedDue.status);

  const unchanged = await TaskModel.findById(task._id).lean().exec();
  check(unchanged?.startDate.toISOString().slice(0, 10) === iso(5),
    'the committed start date is exactly where it was', unchanged?.startDate);
  check(unchanged?.dueDate.toISOString().slice(0, 10) === iso(9),
    'and so is the due date — nothing was written around the cascade');

  section('4. Even a valid-looking pair of dates cannot walk around it');
  const both = await patch(`/api/tasks/${taskId}`, gc.token, { startDate: iso(6), dueDate: iso(10) });
  check(both.status === 409, 'naming both dates together is refused too', both.status);

  section('5. Responsibility and progress are not editable fields');
  const reassign = await patch(`/api/tasks/${taskId}`, gc.token, {
    assigneeId: outsider.userId.toString(),
  });
  check(reassign.status === 400, 'naming an assignee is refused by validation', reassign.status);
  const progress = await patch(`/api/tasks/${taskId}`, gc.token, { completedAt: iso(8) });
  check(progress.status === 400, 'and so is naming a completion stamp', progress.status);

  const stillSub = await TaskModel.findById(task._id).lean().exec();
  check(stillSub?.assignee?.toString() === sub.userId.toString(),
    'responsibility is still where the handoff flow left it');

  section('6. Authority comes from a grant, never from being on the project');
  const bySub = await patch(`/api/tasks/${taskId}`, sub.token, { title: 'שינוי מהקבלן' });
  check(bySub.status === 403, 'the responsible party holds no task.create here, so the edit is refused',
    bySub.status);
  const byOutsider = await patch(`/api/tasks/${taskId}`, outsider.token, { title: 'זר' });
  check(byOutsider.status === 404 || byOutsider.status === 403,
    'and somebody with no standing cannot tell the task exists', byOutsider.status);

  section('7. Moving work between stages is sequencing, and asks for that grant');
  const moveStage = await patch(`/api/tasks/${taskId}`, gc.token, { stageId: second._id.toString() });
  check(moveStage.status === 200, 'the creator holds project.stage.manage through the owning grant',
    moveStage.status);

  await ProjectMembershipModel.updateOne(
    { project, user: sub.userId },
    { $set: { permissions: ['task.create'], fullAuthority: false } },
  ).exec();
  const subEdits = await patch(`/api/tasks/${taskId}`, sub.token, { title: 'עם ההרשאה' });
  check(subEdits.status === 200, 'granting task.create is what opens the edit', subEdits.status);

  const subMovesStage = await patch(`/api/tasks/${taskId}`, sub.token, {
    stageId: stage._id.toString(),
  });
  check(subMovesStage.status === 403,
    'but task.create is not sequencing authority, so the stage move is still refused',
    subMovesStage.status);

  section('8. Standalone work has no other professional, so its dates are its owner’s');
  const standalone = await post('/api/tasks', gc.token, {
    kind: 'standalone', title: 'עבודה עצמאית', startDate: iso(3), dueDate: iso(6),
  });
  const standaloneId = (standalone.body as { task: { id: string } }).task.id;

  const ownFields = await get(`/api/tasks/${standaloneId}/editable`, gc.token);
  const own = (ownFields.body as { editable: Record<string, boolean> }).editable;
  check(own['canEditDatesDirectly'] === true, 'the owner may move their own dates');
  check(own['datesGoThroughProposal'] === false, 'and no proposal stands between them');

  const movedOwn = await patch(`/api/tasks/${standaloneId}`, gc.token, { dueDate: iso(8) });
  check(movedOwn.status === 200, 'the move is accepted', movedOwn.status);
  check((movedOwn.body as { task: { dueDate: string } }).task.dueDate === iso(8),
    'and the date actually changed');

  const backwards = await patch(`/api/tasks/${standaloneId}`, gc.token, { dueDate: iso(1) });
  check(
    (backwards.body as { code?: string }).code === 'DUE_BEFORE_START',
    'a due date before the start is refused by the same rule Create Task uses',
    JSON.stringify(backwards.body),
  );

  const notMine = await patch(`/api/tasks/${standaloneId}`, sub.token, { title: 'לא שלי' });
  check(notMine.status === 403 || notMine.status === 404,
    'and somebody else’s standalone work is not editable', notMine.status);

  section('9. An empty edit is refused rather than silently doing nothing');
  const empty = await patch(`/api/tasks/${taskId}`, gc.token, {});
  check(empty.status === 400, 'a body with no fields is refused', empty.status);

  await ProjectStageModel.deleteMany({ project }).exec();
  await TaskModel.deleteMany({ $or: [{ project }, { createdBy: gc.userId }] }).exec();
  await cleanUp(MARKER);
  await finish(harness);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
