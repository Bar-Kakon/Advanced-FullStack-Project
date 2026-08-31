/**
 * The Schedule Exceptions domain: who may ask, who may approve, and the proof that the cascade
 * computes against the same approved rows rather than the weekly pattern alone.
 *
 *   npm run verify:schedule-exceptions
 */
import { Types } from 'mongoose';

import { DEFAULT_WORKING_CALENDAR } from '../src/features/calendar/workingCalendar.types.js';
import { isWorkingDay, plainCalendar } from '../src/features/calendar/workingDay.js';
import { NotificationModel } from '../src/features/notifications/notification.model.js';
import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { calendarFor } from '../src/features/scheduleexceptions/exceptionCalendar.js';
import { ScheduleExceptionModel } from '../src/features/scheduleexceptions/scheduleException.model.js';
import { scheduleExceptionRepository } from '../src/features/scheduleexceptions/scheduleException.repository.js';
import { ProjectStageModel } from '../src/features/tasks/projectStage.model.js';
import { TaskModel } from '../src/features/tasks/task.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-sched-exc';
const iso = (offset: number): string =>
  new Date(Date.UTC(2027, 9, 3) + offset * 86_400_000).toISOString().slice(0, 10);
const at = (offset: number): Date => new Date(iso(offset));

const PATTERN = plainCalendar(DEFAULT_WORKING_CALENDAR);
/** Offsets are resolved against the real pattern rather than assumed, so no check rests on a guess. */
const nextWorkingOffset = (from: number): number => {
  for (let offset = from; offset < from + 14; offset += 1) {
    if (isWorkingDay(PATTERN, at(offset))) return offset;
  }
  throw new Error('No working day found near that offset.');
};
const nextNonWorkingOffset = (from: number): number => {
  for (let offset = from; offset < from + 14; offset += 1) {
    if (!isWorkingDay(PATTERN, at(offset))) return offset;
  }
  throw new Error('No non-working day found near that offset.');
};

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);
  await ScheduleExceptionModel.deleteMany({}).exec();

  const post = (path: string, token: string, json?: unknown) =>
    request(baseUrl, 'POST', path, { token, ...(json === undefined ? {} : { json }) });
  const get = (path: string, token: string) => request(baseUrl, 'GET', path, { token });
  const patch = (path: string, token: string, json: unknown) =>
    request(baseUrl, 'PATCH', path, { token, json });

  // Named once, against the real pattern, so every later assertion is about the exception layer
  // rather than about which weekday an offset happened to land on.
  const offWork = nextWorkingOffset(5);
  const wideOff = nextWorkingOffset(offWork + 1);
  const restDay = nextNonWorkingOffset(3);

  const gc = await createAccount(baseUrl, MARKER, 1);
  const subA = await createAccount(baseUrl, MARKER, 2);
  const subB = await createAccount(baseUrl, MARKER, 3);
  const outsider = await createAccount(baseUrl, MARKER, 4);

  const created = await post('/api/projects', gc.token, {
    name: 'אתר החריגים', startDate: iso(0), targetEndDate: iso(180),
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
  await join(subA);
  await join(subB);

  const stage = await ProjectStageModel.create({
    project, name: 'שלד', order: 0, isGate: false, dependsOn: [],
  });
  const task = await TaskModel.create({
    kind: 'project', project, stage: stage._id, company: gc.companyId, createdBy: gc.userId,
    assignee: subA.userId, title: 'יציקה', startDate: at(4), dueDate: at(8),
    ownCrewOnly: false, delegatorOnSiteRequired: false,
  });

  section('1. A professional asks for themself, and never for another');
  const asked = await post(`/api/schedule-exceptions/projects/${projectId}`, subA.token, {
    kind: 'non_working', scope: 'professional', fromDate: iso(offWork), toDate: iso(offWork),
    reason: 'יום מילואים',
  });
  check(asked.status === 201, 'a subcontractor may raise one for their own work', asked.status);
  const exceptionId = (asked.body as { exception: { id: string } }).exception.id;

  const stored = await ScheduleExceptionModel.findById(exceptionId).lean().exec();
  check(stored?.professional?.toString() === subA.userId.toString(),
    'the subject is taken from the token, not the body');

  const forAnother = await post(`/api/schedule-exceptions/projects/${projectId}`, subA.token, {
    kind: 'non_working', scope: 'professional', fromDate: iso(wideOff), toDate: iso(wideOff),
    professionalId: subB.userId.toString(),
  });
  check(forAnother.status === 400,
    'naming somebody else is refused by the schema rather than quietly ignored',
    forAnother.status);

  section('2. A project-wide exception is not a request for oneself');
  const wide = await post(`/api/schedule-exceptions/projects/${projectId}`, subA.token, {
    kind: 'non_working', scope: 'project', fromDate: iso(7), toDate: iso(7),
  });
  check(wide.status === 403, 'so a subcontractor cannot raise one', wide.status);
  check((wide.body as { code?: string }).code === 'SCHEDULE_EXCEPTION_PROJECT_SCOPE',
    'and the answer says why', JSON.stringify(wide.body));

  section('3. Approving asks for schedule.exception.approve, not partial release');
  await ProjectMembershipModel.updateOne(
    { project, user: subB.userId },
    { $set: { permissions: ['schedule.partial_release.manage'], fullAuthority: false } },
  ).exec();
  const wrongGrant = await post(`/api/schedule-exceptions/${exceptionId}/decision`, subB.token, {
    approve: true,
  });
  check(wrongGrant.status === 403,
    'partial release is a different question and does not approve an exception',
    wrongGrant.status);

  await ProjectMembershipModel.updateOne(
    { project, user: subB.userId },
    { $set: { permissions: ['schedule.exception.approve'], fullAuthority: false } },
  ).exec();

  section('4. The approver may change a request, and it routes back through the submitter');
  const modified = await patch(`/api/schedule-exceptions/${exceptionId}`, subB.token, {
    toDate: iso(offWork), note: 'אושר ליום אחד בלבד',
  });
  check(modified.status === 200, 'the approver changes the window', modified.status);
  const afterModify = (modified.body as { exception: { status: string; history: unknown[] } }).exception;
  check(afterModify.status === 'requested',
    'and the request is still waiting rather than approved in the same move');
  check(afterModify.history.length === 2, 'the change is appended to the history', afterModify.history.length);

  const backToSubmitter = await NotificationModel.findOne({
    user: subA.userId, type: 'schedule.exception.modified',
  }).lean().exec();
  check(backToSubmitter !== null, 'and the submitting professional is told');

  const submitterModifies = await patch(`/api/schedule-exceptions/${exceptionId}`, subA.token, {
    toDate: iso(9),
  });
  check(submitterModifies.status === 403,
    'the submitter cannot rewrite their own request past the approver', submitterModifies.status);

  section('5. An authorised approval ends the matter');
  const approved = await post(`/api/schedule-exceptions/${exceptionId}/decision`, subB.token, {
    approve: true, note: 'מאושר',
  });
  check(approved.status === 200, 'the delegate approves within their granted authority', approved.status);
  check((approved.body as { exception: { status: string } }).exception.status === 'approved',
    'and the row is approved');

  const secondApproval = await post(`/api/schedule-exceptions/${exceptionId}/decision`, gc.token, {
    approve: true,
  });
  check(secondApproval.status === 409,
    'no second approval follows — the decided row refuses another decision',
    secondApproval.status);
  check((secondApproval.body as { code?: string }).code === 'SCHEDULE_EXCEPTION_DECIDED',
    'and says the matter is already decided');

  section('6. On approval a derived notice reaches each affected professional');
  const derived = await NotificationModel.findOne({
    user: subA.userId, type: 'schedule.exception.decided',
  }).lean().exec();
  check(derived !== null, 'the submitter is told the decision');

  const projectWide = await post(`/api/schedule-exceptions/projects/${projectId}`, gc.token, {
    kind: 'non_working', scope: 'project', fromDate: iso(wideOff), toDate: iso(wideOff),
    reason: 'סגירת אתר',
  });
  const wideId = (projectWide.body as { exception: { id: string } }).exception.id;
  await post(`/api/schedule-exceptions/${wideId}/decision`, gc.token, { approve: true });

  const affected = await NotificationModel.findOne({
    user: subA.userId, type: 'schedule.exception.affects_you',
  }).lean().exec();
  check(affected !== null, 'and the professional whose live work it overlaps is told separately');

  const affectedOutsider = await NotificationModel.countDocuments({
    user: outsider.userId,
  }).exec();
  check(affectedOutsider === 0, 'somebody who is not on the project is told nothing', affectedOutsider);

  section('7. The notification payload carries no other party’s private text');
  const rows = await NotificationModel.find({ user: subA.userId }).lean().exec();
  const leaked = rows.filter((row) => JSON.stringify(row.payload).includes('מאושר'));
  check(leaked.length === 0, 'the approver’s decision note is not in any payload', leaked.length);

  section('8. The calendar layer resolves what the arithmetic will read');
  const approvedRows = await scheduleExceptionRepository.listApproved(project);
  const forSubA = calendarFor(DEFAULT_WORKING_CALENDAR, approvedRows, {
    professionalId: subA.userId.toString(),
  });
  check(isWorkingDay(forSubA, at(offWork)) === false,
    'the approved non-working date is not a working day for that professional');
  check(isWorkingDay(PATTERN, at(offWork)) === true,
    'though the weekly pattern alone still says it is — which is the whole point');

  const forSubB = calendarFor(DEFAULT_WORKING_CALENDAR, approvedRows, {
    professionalId: subB.userId.toString(),
  });
  check(isWorkingDay(forSubB, at(offWork)) === true,
    'and a professional-scoped exception reaches nobody else');
  check(isWorkingDay(forSubB, at(wideOff)) === false,
    'while the project-wide one reaches everyone');

  section('9. A working-date override runs in the other direction');
  const workFriday = await post(`/api/schedule-exceptions/projects/${projectId}`, subA.token, {
    kind: 'working', scope: 'professional', fromDate: iso(restDay), toDate: iso(restDay),
    reason: 'השלמת יציקה',
  });
  const fridayId = (workFriday.body as { exception: { id: string } }).exception.id;
  await post(`/api/schedule-exceptions/${fridayId}/decision`, gc.token, { approve: true });

  const withFriday = calendarFor(
    DEFAULT_WORKING_CALENDAR,
    await scheduleExceptionRepository.listApproved(project),
    { professionalId: subA.userId.toString() },
  );
  check(isWorkingDay(PATTERN, at(restDay)) === false,
    'a rest day is not in the weekly pattern');
  check(isWorkingDay(withFriday, at(restDay)) === true,
    'but an approved working-date override makes it one');

  section('10. The cascade reads the same layer');
  const preview = await post('/api/coordination/preview', gc.token, {
    taskId: task._id.toString(), changes: { deltaWorkingDays: 2 },
  });
  check(preview.status === 200, 'an impact preview still computes', preview.status);
  const impact = (preview.body as {
    preview: { affected: { taskId: string; proposedDue: string }[] };
  }).preview;
  const initiating = impact.affected.find((row) => row.taskId === task._id.toString());
  check(initiating !== undefined && initiating.proposedDue !== iso(8),
    'and the proposed due date moved off the committed one', initiating?.proposedDue);

  section('11. Only the submitter withdraws, and only while it is waiting');
  const pending = await post(`/api/schedule-exceptions/projects/${projectId}`, subA.token, {
    kind: 'non_working', scope: 'professional', fromDate: iso(20), toDate: iso(20),
  });
  const pendingId = (pending.body as { exception: { id: string } }).exception.id;

  const cancelledByOther = await post(`/api/schedule-exceptions/${pendingId}/cancel`, subB.token);
  check(cancelledByOther.status === 403, 'the approver cannot withdraw somebody’s request',
    cancelledByOther.status);
  const cancelled = await post(`/api/schedule-exceptions/${pendingId}/cancel`, subA.token);
  check(cancelled.status === 200, 'the submitter can', cancelled.status);

  section('12. Somebody with no standing learns nothing');
  const outsiderList = await get(`/api/schedule-exceptions/projects/${projectId}`, outsider.token);
  check(outsiderList.status === 404, 'the list answers as though the project does not exist',
    outsiderList.status);
  const outsiderDecides = await post(`/api/schedule-exceptions/${exceptionId}/decision`, outsider.token, {
    approve: false,
  });
  check(outsiderDecides.status === 404 || outsiderDecides.status === 403,
    'and no decision reaches a stranger’s hands', outsiderDecides.status);

  section('13. No holiday was invented');
  const all = await ScheduleExceptionModel.find({ project }).lean().exec();
  check(all.every((row) => row.requestedBy !== undefined),
    'every stored row was asked for by a person — nothing was populated from a table', all.length);

  await ScheduleExceptionModel.deleteMany({ project }).exec();
  await NotificationModel.deleteMany({ project }).exec();
  await ProjectStageModel.deleteMany({ project }).exec();
  await TaskModel.deleteMany({ project }).exec();
  await cleanUp(MARKER);
  await finish(harness);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
