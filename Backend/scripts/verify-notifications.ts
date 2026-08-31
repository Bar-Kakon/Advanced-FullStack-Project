/**
 * The Notifications domain: the closed delivery rules, the 90-minute grace the seen mark cancels,
 * the digest's plan entitlement, and what Project Mute may and may not suppress.
 *
 *   npm run verify:notifications
 */
import { Types } from 'mongoose';

import type { MailMessage, Mailer } from '../src/mail/mailer.js';
import { PlanModel } from '../src/features/billing/plan.model.js';
import { PLAN_CATALOGUE } from '../src/features/billing/planCatalogue.js';
import { createEntitlementService } from '../src/features/billing/entitlements.service.js';
import { planRepository } from '../src/features/billing/plan.repository.js';
import { MuteModel } from '../src/features/mutes/mute.model.js';
import { CLASS_OF, NotificationModel } from '../src/features/notifications/notification.model.js';
import { notificationRepository } from '../src/features/notifications/notification.repository.js';
import { applyQuietWindow } from '../src/features/notifications/notificationDispatch.service.js';
import { createDigestWorker } from '../src/features/notifications/digest.worker.js';
import { createNotificationEmailWorker } from '../src/features/notifications/notificationEmail.worker.js';
import { QueuedEmailModel } from '../src/features/notifications/queuedEmail.model.js';
import { queuedEmailRepository } from '../src/features/notifications/queuedEmail.repository.js';
import { recipientRepository } from '../src/features/notifications/recipient.repository.js';
import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { ProjectStageModel } from '../src/features/tasks/projectStage.model.js';
import { TaskModel } from '../src/features/tasks/task.model.js';
import { UserModel } from '../src/features/users/user.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-notif';
const iso = (offset: number): string =>
  new Date(Date.UTC(2027, 9, 3) + offset * 86_400_000).toISOString().slice(0, 10);
const MINUTE = 60_000;

/** Captures what would have been sent, so nothing leaves and every message can be inspected. */
const createCapturingMailer = (): Mailer & { readonly sent: MailMessage[] } => {
  const sent: MailMessage[] = [];
  return {
    mode: 'log',
    sent,
    async send(message) {
      sent.push(message);
    },
  };
};

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);
  await NotificationModel.deleteMany({}).exec();
  await QueuedEmailModel.deleteMany({}).exec();
  await MuteModel.deleteMany({}).exec();

  // The catalogue has to exist for the entitlement boundary to read a real ladder.
  for (const seed of PLAN_CATALOGUE) {
    await PlanModel.updateOne(
      { code: seed.code },
      { $set: { ...seed, active: true, interval: 'month', provisional: true } },
      { upsert: true },
    ).exec();
  }

  const post = (path: string, token: string, json?: unknown) =>
    request(baseUrl, 'POST', path, { token, ...(json === undefined ? {} : { json }) });
  const get = (path: string, token: string) => request(baseUrl, 'GET', path, { token });
  const put = (path: string, token: string, json: unknown) =>
    request(baseUrl, 'PUT', path, { token, json });

  const gc = await createAccount(baseUrl, MARKER, 1);
  const sub = await createAccount(baseUrl, MARKER, 2);
  const invitee = await createAccount(baseUrl, MARKER, 3);
  const outsider = await createAccount(baseUrl, MARKER, 4);

  const created = await post('/api/projects', gc.token, {
    name: 'אתר ההתראות', startDate: iso(0), targetEndDate: iso(180),
    overrunAllowanceDays: 30, projectType: 'building', size: 'בניין 3 קומות',
  });
  const projectId = (created.body as { project: { id: string } }).project.id;
  const project = new Types.ObjectId(projectId);

  const join = async (who: { userId: Types.ObjectId; token: string }, accept = true) => {
    await post(`/api/projects/${projectId}/members`, gc.token, {
      userId: who.userId.toString(), projectRole: 'subcontractor',
    });
    const row = await ProjectMembershipModel.findOne({ project, user: who.userId }).lean().exec();
    if (accept) await post(`/api/project-invitations/${row?._id.toString()}/accept`, who.token);
    return row;
  };
  await join(sub);
  await join(invitee, false);

  section('1. An invitation is a blocking notice, and reaches only the person invited');
  const invitation = await NotificationModel.findOne({
    user: invitee.userId, type: 'project.invitation',
  }).lean().exec();
  check(invitation !== null, 'the invited professional is told');
  check(invitation?.class === 'blocking', 'and it is blocking', invitation?.class);
  check(invitation?.seenAt === undefined, 'unread is the absence of a seen mark, not a flag');

  const toOutsider = await NotificationModel.countDocuments({ user: outsider.userId }).exec();
  check(toOutsider === 0, 'nobody outside the project is told anything', toOutsider);

  section('2. An invited-but-not-active account gains no project notification data');
  const inviteeFeed = await get('/api/notifications', invitee.token);
  const rows = (inviteeFeed.body as { notifications: { projectId: string | null }[] }).notifications;
  check(inviteeFeed.status === 200, 'the invitee reads their own feed', inviteeFeed.status);
  check(rows.length === 1, 'and it holds exactly the invitation', rows.length);

  const stage = await ProjectStageModel.create({
    project, name: 'שלד', order: 0, isGate: false, dependsOn: [],
  });
  const assigned = await post('/api/tasks', gc.token, {
    kind: 'project', projectId, stageId: stage._id.toString(), title: 'יציקה',
    assigneeId: sub.userId.toString(), startDate: iso(4), dueDate: iso(8),
  });
  check(assigned.status === 201, 'a task is assigned', assigned.status);

  section('3. One product event makes one row, however often it is emitted');
  const assignedRows = await NotificationModel.countDocuments({
    user: sub.userId, type: 'task.assigned',
  }).exec();
  check(assignedRows === 1, 'the assignee has exactly one assignment notice', assignedRows);

  const taskId = (assigned.body as { task: { id: string } }).task.id;
  const duplicate = await notificationRepository.create({
    user: sub.userId, type: 'task.assigned', class: 'blocking', project,
    task: new Types.ObjectId(taskId), payload: {}, mutedAtCreation: false,
    dedupeKey: `task.assigned:${taskId}`,
  });
  check(duplicate === null, 'emitting the same event again writes nothing');
  const stillOne = await NotificationModel.countDocuments({
    user: sub.userId, type: 'task.assigned',
  }).exec();
  check(stillOne === 1, 'and there is still one row', stillOne);

  section('4. A blocking notice does not email at once — it opens the 90-minute window');
  // Free carries blocking coverage in-app and no email at all, so the email rules are exercised on
  // a tier that actually has the channel.
  const freeQueued = await QueuedEmailModel.countDocuments({ user: sub.userId }).exec();
  check(freeQueued === 0, 'a Free account queues no email, which is the tier working', freeQueued);

  await UserModel.updateOne({ _id: sub.userId }, { $set: { planCode: 'basic' } }).exec();
  const emailingTask = await post('/api/tasks', gc.token, {
    kind: 'project', projectId, stageId: stage._id.toString(), title: 'איטום',
    assigneeId: sub.userId.toString(), startDate: iso(30), dueDate: iso(34),
  });
  check(emailingTask.status === 201, 'work is assigned to an account whose plan carries email',
    emailingTask.status);

  const queued = await QueuedEmailModel.findOne({ user: sub.userId }).lean().exec();
  check(queued !== null, 'an email is queued rather than sent');
  const graceMinutes = queued === null ? 0 : Math.round((queued.sendAfter.getTime() - queued.createdAt.getTime()) / MINUTE);
  check(graceMinutes === 90, 'and it waits exactly ninety minutes', graceMinutes);
  check(queued?.status === 'queued', 'nothing has gone out yet', queued?.status);

  const mailer = createCapturingMailer();
  const entitlements = createEntitlementService({ plans: planRepository, users: { findPlanCode: (id) => recipientPlan(id) } });
  const emailWorker = createNotificationEmailWorker({
    emails: queuedEmailRepository,
    notifications: notificationRepository,
    recipients: recipientRepository,
    entitlements,
    mailer,
    frontendUrl: 'http://localhost:5173',
  });

  const early = await emailWorker.runOnce(new Date());
  check(early.sent === 0, 'a sweep inside the window sends nothing', early.sent);
  check(mailer.sent.length === 0, 'and no message left', mailer.sent.length);

  section('5. Seeing the in-app notice inside the window cancels the queued email');
  const assignedRow = await NotificationModel.findOne({
    user: sub.userId,
    task: new Types.ObjectId((emailingTask.body as { task: { id: string } }).task.id),
  }).lean().exec();
  const seen = await post('/api/notifications/seen', sub.token, {
    ids: [assignedRow?._id.toString()],
  });
  check(seen.status === 200, 'the assignee marks it seen', seen.status);

  const cancelled = await QueuedEmailModel.findOne({ user: sub.userId }).lean().exec();
  check(cancelled?.status === 'cancelled', 'the queued email is cancelled', cancelled?.status);
  check(cancelled?.cancelReason === 'seen', 'and the reason is that it was read', cancelled?.cancelReason);

  const afterGrace = await emailWorker.runOnce(new Date(Date.now() + 91 * MINUTE));
  check(afterGrace.sent === 0, 'so nothing is sent once the window closes either', afterGrace.sent);
  check(mailer.sent.length === 0, 'and still no message left', mailer.sent.length);

  section('6. An unread blocking notice does email once the window closes');
  await post(`/api/tasks/${taskId}/editable`, gc.token).catch(() => undefined);
  const secondTask = await post('/api/tasks', gc.token, {
    kind: 'project', projectId, stageId: stage._id.toString(), title: 'טיח',
    assigneeId: sub.userId.toString(), startDate: iso(10), dueDate: iso(14),
  });
  check(secondTask.status === 201, 'a second task is assigned', secondTask.status);

  const later = await emailWorker.runOnce(new Date(Date.now() + 91 * MINUTE));
  check(later.sent === 1, 'the unread one is sent after the grace', later.sent);
  const message = mailer.sent[0];
  check(message !== undefined && message.to === sub.email, 'to the right person', message?.to);
  check(
    message !== undefined && message.html.includes('/tasks/'),
    'and it leads back into the platform rather than carrying the action',
    message?.html.slice(0, 40),
  );
  check(
    message !== undefined && !/approve|אישור|decline|דחייה/i.test(message.html),
    'no approve or decline control travels in the email',
  );

  section('7. Operational email is an opt-in, and the platform works without it');
  await UserModel.updateOne(
    { _id: sub.userId },
    { $set: { 'notificationPreferences.operationalEmail': false } },
  ).exec();
  await QueuedEmailModel.deleteMany({}).exec();

  const thirdTask = await post('/api/tasks', gc.token, {
    kind: 'project', projectId, stageId: stage._id.toString(), title: 'צבע',
    assigneeId: sub.userId.toString(), startDate: iso(16), dueDate: iso(20),
  });
  check(thirdTask.status === 201, 'work is still assigned', thirdTask.status);
  const inAppStill = await NotificationModel.countDocuments({
    user: sub.userId, task: new Types.ObjectId((thirdTask.body as { task: { id: string } }).task.id),
  }).exec();
  check(inAppStill === 1, 'the in-app notice still appears', inAppStill);
  const nothingQueued = await QueuedEmailModel.countDocuments({ user: sub.userId }).exec();
  check(nothingQueued === 0, 'but nothing is queued for email', nothingQueued);

  await UserModel.updateOne(
    { _id: sub.userId },
    { $set: { 'notificationPreferences.operationalEmail': true } },
  ).exec();

  section('8. Project Mute changes delivery, never whether the event happened');
  await put(`/api/mutes/projects/${projectId}`, sub.token, { muted: true });
  await QueuedEmailModel.deleteMany({}).exec();

  const mutedTask = await post('/api/tasks', gc.token, {
    kind: 'project', projectId, stageId: stage._id.toString(), title: 'ריצוף',
    assigneeId: sub.userId.toString(), startDate: iso(22), dueDate: iso(26),
  });
  check(mutedTask.status === 201, 'work is assigned on a muted project', mutedTask.status);

  const mutedRow = await NotificationModel.findOne({
    user: sub.userId, task: new Types.ObjectId((mutedTask.body as { task: { id: string } }).task.id),
  }).lean().exec();
  check(mutedRow !== null, 'the domain event still produced a row — mute is not deletion');
  check(mutedRow?.mutedAtCreation === true, 'and the row records that it was muted');
  check(mutedRow?.class === 'blocking', 'a blocking notice is still blocking');

  const mutedQueued = await QueuedEmailModel.countDocuments({ user: sub.userId }).exec();
  check(mutedQueued === 0, 'no email is queued while the project is muted', mutedQueued);

  const stillReadable = await get(`/api/tasks/${(mutedTask.body as { task: { id: string } }).task.id}`, sub.token);
  check(stillReadable.status === 200, 'and the muted member still reads the work itself',
    stillReadable.status);
  const membership = await ProjectMembershipModel.findOne({ project, user: sub.userId }).lean().exec();
  check(membership?.status === 'active', 'mute changed no membership');
  check((membership?.permissions ?? []).length === 0 && membership?.fullAuthority === false,
    'and no authority');

  await put(`/api/mutes/projects/${projectId}`, sub.token, { muted: false });

  section('9. The digest is a plan entitlement, and Free is blocking coverage only');
  await NotificationModel.deleteMany({}).exec();
  await QueuedEmailModel.deleteMany({}).exec();

  const nonBlocking = await notificationRepository.create({
    user: sub.userId, type: 'workplan.version_added', class: 'nonblocking', project,
    payload: { taskTitle: 'יציקה', count: 2 }, mutedAtCreation: false,
    dedupeKey: `workplan.version_added:${new Types.ObjectId().toString()}`,
  });
  check(nonBlocking !== null, 'a non-blocking event is recorded');
  const noQueue = await QueuedEmailModel.countDocuments({ user: sub.userId }).exec();
  check(noQueue === 0, 'and never queues an individual email', noQueue);

  const digestMailer = createCapturingMailer();
  const digestWorker = createDigestWorker({
    notifications: notificationRepository,
    recipients: recipientRepository,
    entitlements,
    mailer: digestMailer,
    frontendUrl: 'http://localhost:5173',
  });
  const eighteen = new Date();
  eighteen.setUTCHours(18, 0, 0, 0);

  await UserModel.updateOne({ _id: sub.userId }, { $set: { planCode: 'free' } }).exec();
  const freeSweep = await digestWorker.runOnce(eighteen);
  check(freeSweep.sent === 0, 'a Free account gets no digest', freeSweep.sent);

  await UserModel.updateOne({ _id: sub.userId }, { $set: { planCode: 'basic' } }).exec();
  const basicSweep = await digestWorker.runOnce(eighteen);
  check(basicSweep.sent === 1, 'Basic is where the digest starts', basicSweep.sent);
  const digest = digestMailer.sent[0];
  check(digest !== undefined && digest.text.includes('יציקה'),
    'and it carries the item', digest?.subject);

  section('10. The digest carries only what is still relevant');
  await NotificationModel.deleteMany({}).exec();
  const handled = await notificationRepository.create({
    user: sub.userId, type: 'responsibility.transfer_accepted', class: 'nonblocking', project,
    payload: {}, mutedAtCreation: false,
    dedupeKey: `handled:${new Types.ObjectId().toString()}`,
  });
  await notificationRepository.markSeen(sub.userId, [handled?._id as Types.ObjectId]);

  const afterSeen = await digestWorker.runOnce(new Date(eighteen.getTime() + 3_600_000));
  check(afterSeen.sent === 0,
    'something already handled in-app is not resurfaced by the evening email', afterSeen.sent);

  section('11. A client cannot grant itself Premium timing controls');
  await UserModel.updateOne({ _id: sub.userId }, { $set: { planCode: 'basic' } }).exec();
  const grab = await put('/api/settings/notifications', sub.token, {
    timing: [{ notificationClass: 'blocking', quietFromMinute: 0, quietToMinute: 1440 }],
    digestHour: 3,
  });
  check(grab.status === 200, 'the request is accepted rather than erroring', grab.status);

  const stored = await UserModel.findById(sub.userId).lean().exec();
  check(stored?.notificationPreferences?.timing === undefined,
    'but no timing rule was written for a Basic account',
    JSON.stringify(stored?.notificationPreferences));
  check(stored?.notificationPreferences?.digestHour === undefined,
    'and no digest hour either');

  await UserModel.updateOne({ _id: sub.userId }, { $set: { planCode: 'premium' } }).exec();
  const allowed = await put('/api/settings/notifications', sub.token, { digestHour: 7 });
  check(allowed.status === 200, 'Premium may set one', allowed.status);
  const premiumStored = await UserModel.findById(sub.userId).lean().exec();
  check(premiumStored?.notificationPreferences?.digestHour === 7, 'and it is stored',
    premiumStored?.notificationPreferences?.digestHour);

  section('12. A quiet window moves when a delivery goes out, never whether');
  const inside = applyQuietWindow(
    new Date(Date.UTC(2027, 9, 3, 23, 0)),
    [{ notificationClass: 'blocking', quietFromMinute: 22 * 60, quietToMinute: 6 * 60 }],
    'blocking',
  );
  check(inside.getUTCHours() === 6, 'a delivery inside a wrapping window waits for it to end',
    inside.toISOString());
  check(inside.getUTCDate() === 4, 'on the following day', inside.getUTCDate());

  const outside = new Date(Date.UTC(2027, 9, 3, 12, 0));
  check(
    applyQuietWindow(outside, [{ notificationClass: 'blocking', quietFromMinute: 22 * 60, quietToMinute: 6 * 60 }], 'blocking')
      .getTime() === outside.getTime(),
    'a delivery outside it is untouched',
  );

  section('13. Every type has a class, and blocking is what could stall work');
  check(CLASS_OF['proposal.awaiting_response'] === 'blocking',
    'a proposal waiting on somebody is blocking');
  check(CLASS_OF['schedule.change_resolved'] === 'blocking',
    'a resolved change that moves your work is blocking');
  check(CLASS_OF['task.early_completion'] === 'blocking',
    'early completion is blocking, so the digest tier cannot withhold it from Free');
  check(CLASS_OF['workplan.version_added'] === 'nonblocking',
    'a new work-plan version aggregates instead');

  section('14. A notification DTO carries no other professional’s private text');
  const feed = await get('/api/notifications', sub.token);
  const payloads = JSON.stringify((feed.body as { notifications: unknown[] }).notifications);
  for (const forbidden of ['declineReason', 'counterStart', 'counterDue', 'otherSolution', 'reason']) {
    check(!payloads.includes(forbidden), `no ${forbidden} field reaches a client`);
  }

  section('15. Nobody reads or marks another account’s notifications');
  const otherRow = await notificationRepository.create({
    user: sub.userId, type: 'task.assigned', class: 'blocking', project,
    payload: {}, mutedAtCreation: false,
    dedupeKey: `not-yours:${new Types.ObjectId().toString()}`,
  });
  check(otherRow !== null && otherRow.seenAt === undefined,
    'there is an unread row belonging to somebody else');
  const stolen = await post('/api/notifications/seen', outsider.token, {
    ids: [otherRow?._id.toString()],
  });
  check(stolen.status === 200, 'the call is answered', stolen.status);
  const untouched = await NotificationModel.findById(otherRow?._id).lean().exec();
  check(untouched?.seenAt === undefined, 'but somebody else’s row was not marked');

  await NotificationModel.deleteMany({}).exec();
  await QueuedEmailModel.deleteMany({}).exec();
  await MuteModel.deleteMany({}).exec();
  await ProjectStageModel.deleteMany({ project }).exec();
  await TaskModel.deleteMany({ project }).exec();
  await cleanUp(MARKER);
  await finish(harness);
};

/** The plan code the entitlement boundary reads, straight from the account. */
const recipientPlan = async (userId: string): Promise<'free' | 'basic' | 'premium' | null> => {
  const row = await UserModel.findById(userId).select('planCode').lean<{ planCode?: 'free' | 'basic' | 'premium' }>().exec();
  return row?.planCode ?? null;
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
