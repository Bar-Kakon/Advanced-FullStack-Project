/**
 * Standalone date management — the single runtime verification for the correction batch.
 *
 * Proves, over real HTTP against the real app on an ISOLATED database: a standalone planned-date
 * change succeeds and persists; the originally agreed dates stay intact; the change trail is
 * written; no project schedule moves, no proposal opens, no approval is asked and no audit or
 * flexibility evidence is fabricated; the commissioning counterparty of agreement-born work is
 * told for information only, and nobody else is; the original agreement message is never
 * rewritten; project-linked scheduling keeps working; and the legacy backfill recovers verified
 * originals from agreement evidence, sets a clearly marked migration baseline from the current
 * dates on other standalone work, and invents history for nothing.
 *
 *   npm run verify:standalone-dates
 */
import './support/developmentGuard.js';
import { config as loadEnvFile } from 'dotenv';
import mongoose, { Types } from 'mongoose';

import { AuditEntryModel } from '../src/features/coordination/auditEntry.model.js';
import { RescheduleProposalModel } from '../src/features/coordination/proposal.model.js';
import { MessageModel } from '../src/features/messaging/message.model.js';
import { NotificationModel } from '../src/features/notifications/notification.model.js';
import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { ProjectStageModel } from '../src/features/tasks/projectStage.model.js';
import { TaskDateChangeModel } from '../src/features/tasks/taskDateChange.model.js';
import { TaskModel } from '../src/features/tasks/task.model.js';
import {
  applyOriginalDates,
  planOriginalDates,
  rollbackOriginalDates,
} from './migrate-original-dates.js';
import { createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-standalone-dates';
const iso = (offset: number): string =>
  new Date(Date.UTC(2027, 10, 4) + offset * 86_400_000).toISOString().slice(0, 10);

// The configured URI is pointed at a database of this run's own before the app connects.
loadEnvFile({ quiet: true });
if (process.env['MONGODB_URI']) {
  const uri = new URL(process.env['MONGODB_URI']);
  uri.pathname = '/blokta-verify-standalone-dates';
  process.env['MONGODB_URI'] = uri.toString();
}

interface DetailDto {
  readonly task: {
    readonly startDate: string;
    readonly dueDate: string;
    readonly originalStartDate: string | null;
    readonly originalDueDate: string | null;
    readonly originalDatesSource: string | null;
    readonly dateChanges: readonly {
      readonly fromDueDate: string;
      readonly toDueDate: string;
      readonly reason: string | null;
    }[];
    readonly fromAgreement: boolean;
    readonly counterparty: { readonly userId: string } | null;
    readonly viewer: { readonly canRequestDateChange: boolean };
  };
}

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await mongoose.connection.dropDatabase();

  const post = (path: string, token: string, json?: unknown) =>
    request(baseUrl, 'POST', path, { token, ...(json === undefined ? {} : { json }) });
  const get = (path: string, token: string) => request(baseUrl, 'GET', path, { token });
  const patch = (path: string, token: string, json: unknown) =>
    request(baseUrl, 'PATCH', path, { token, json });
  const detail = async (taskId: string, token: string) =>
    ((await get(`/api/tasks/${taskId}`, token)).body as unknown as DetailDto).task;

  const performer = await createAccount(baseUrl, MARKER, 1);
  const commissioner = await createAccount(baseUrl, MARKER, 2);
  const gc = await createAccount(baseUrl, MARKER, 3);
  const sub = await createAccount(baseUrl, MARKER, 4);
  const outsider = await createAccount(baseUrl, MARKER, 5);

  section('1. A self-created standalone task: dates move directly, and the originals stay');
  const created = await post('/api/tasks', performer.token, {
    kind: 'standalone', title: 'תיקון אצל לקוח', startDate: iso(2), dueDate: iso(6),
  });
  check(created.status === 201, 'the performer opens standalone work', created.status);
  const soloId = ((created.body as { task: { id: string } }).task).id;

  const soloRow = await TaskModel.findById(soloId).lean().exec();
  check(
    soloRow?.originalStartDate?.toISOString().slice(0, 10) === iso(2) &&
      soloRow?.originalDueDate?.toISOString().slice(0, 10) === iso(6) &&
      soloRow?.originalDatesSource === 'creation',
    'creation stamps the originally agreed dates, marked as a creation stamp',
  );

  const editable = await get(`/api/tasks/${soloId}/editable`, performer.token);
  check(
    (editable.body as { editable: { canEditDatesDirectly: boolean } }).editable.canEditDatesDirectly,
    'the responsible performer may update the planned dates',
  );

  const moved = await patch(`/api/tasks/${soloId}`, performer.token, {
    startDate: iso(4), dueDate: iso(9), dateChangeReason: 'הלקוח דחה את מועד הכניסה',
  });
  check(moved.status === 200, 'a standalone planned-date change succeeds', moved.status);

  const soloAfter = await detail(soloId, performer.token);
  check(
    soloAfter.startDate === iso(4) && soloAfter.dueDate === iso(9),
    'the updated date persists on a fresh read',
    `${soloAfter.startDate} ${soloAfter.dueDate}`,
  );
  check(
    soloAfter.originalStartDate === iso(2) && soloAfter.originalDueDate === iso(6),
    'the original agreed dates remain intact beside it',
  );
  check(soloAfter.dateChanges.length === 1, 'the change is in the history', soloAfter.dateChanges.length);
  check(
    soloAfter.dateChanges[0]?.fromDueDate === iso(6) &&
      soloAfter.dateChanges[0]?.toDueDate === iso(9) &&
      soloAfter.dateChanges[0]?.reason === 'הלקוח דחה את מועד הכניסה',
    'and it records from, to and the reason',
  );
  check(soloAfter.viewer.canRequestDateChange === false, 'no project date-change flow is offered on it');

  const trail = await TaskDateChangeModel.countDocuments({ task: new Types.ObjectId(soloId) }).exec();
  check(trail === 1, 'the trail row is persisted server-side', trail);
  check(
    (await NotificationModel.countDocuments({ type: 'task.updated' }).exec()) === 0,
    'self-created work has no external counterparty, so nobody is notified',
  );

  section('2. An agreement-born standalone task: the agreement is the authority, and the commissioner is told');
  const opened = await post(`/api/conversations/direct/${performer.userId.toString()}`, commissioner.token, {
    body: 'יש עבודה בשבילך',
  });
  const conversationId = (opened.body as { conversation: { id: string } }).conversation.id;
  await post(`/api/conversations/${conversationId}/accept`, performer.token);

  const proposed = await post(`/api/conversations/${conversationId}/agreements`, commissioner.token, {
    title: 'התקנת מעקה', startDate: iso(10), dueDate: iso(16),
  });
  check(proposed.status === 201, 'the commissioner proposes an agreement', proposed.status);
  const agreementId = (proposed.body as { message: { id: string } }).message.id;

  const accepted = await post(
    `/api/conversations/${conversationId}/agreements/${agreementId}/accept`,
    performer.token,
  );
  check(accepted.status === 200, 'the performer accepts it', accepted.status);
  const bornId = (accepted.body as { message: { agreement: { taskId: string } } }).message.agreement.taskId;

  const bornRow = await TaskModel.findById(bornId).lean().exec();
  check(
    bornRow?.originalStartDate?.toISOString().slice(0, 10) === iso(10) &&
      bornRow?.originalDueDate?.toISOString().slice(0, 10) === iso(16),
    'the agreed dates are stamped as the originals',
  );

  const bornView = await detail(bornId, performer.token);
  check(bornView.fromAgreement, 'the task knows it was born from an agreement');
  check(
    bornView.counterparty?.userId === commissioner.userId.toString(),
    'the counterparty is the commissioning party from the agreement message, not createdBy',
  );

  const byCommissioner = await patch(`/api/tasks/${bornId}`, commissioner.token, { dueDate: iso(20) });
  check(byCommissioner.status === 403, 'the commissioner cannot edit the performer’s dates', byCommissioner.status);

  const delayed = await patch(`/api/tasks/${bornId}`, performer.token, {
    dueDate: iso(19), dateChangeReason: 'עיכוב באספקת החומרים',
  });
  check(delayed.status === 200, 'the performer records an execution delay', delayed.status);

  const message = await MessageModel.findById(agreementId).lean().exec();
  check(
    message?.agreement?.startDate === iso(10) &&
      message?.agreement?.dueDate === iso(16) &&
      message?.agreement?.state === 'accepted',
    'the original agreement message is not rewritten',
  );

  const bornAfter = await detail(bornId, performer.token);
  check(
    bornAfter.originalStartDate === iso(10) && bornAfter.originalDueDate === iso(16),
    'the originals still carry the agreement’s dates',
  );
  check(bornAfter.dateChanges.length === 1, 'the delay is one history row', bornAfter.dateChanges.length);

  const toCommissioner = await NotificationModel.countDocuments({
    user: commissioner.userId, type: 'task.updated',
  }).exec();
  check(toCommissioner === 1, 'the commissioner receives exactly one informational notice', toCommissioner);
  check(
    (await NotificationModel.countDocuments({ user: performer.userId, type: 'task.updated' }).exec()) === 0,
    'the editor is not notified about their own change',
  );
  check(
    (await NotificationModel.countDocuments({ user: outsider.userId }).exec()) === 0,
    'nobody outside the agreement is told anything',
  );

  section('3. Nothing project-shaped happened, and project scheduling still works');
  check(
    (await RescheduleProposalModel.countDocuments({}).exec()) === 0,
    'no scheduling proposal was created by any standalone edit',
  );
  check(
    (await AuditEntryModel.countDocuments({}).exec()) === 0,
    'no project audit or flexibility evidence was fabricated',
  );

  const project = await post('/api/projects', gc.token, {
    name: 'אתר הביקורת', startDate: iso(0), targetEndDate: iso(120),
    overrunAllowanceDays: 30, projectType: 'building', size: 'בניין 3 קומות',
  });
  const projectId = (project.body as { project: { id: string } }).project.id;
  await post(`/api/projects/${projectId}/members`, gc.token, {
    userId: sub.userId.toString(), projectRole: 'subcontractor',
  });
  const membership = await ProjectMembershipModel.findOne({
    project: new Types.ObjectId(projectId), user: sub.userId,
  }).lean().exec();
  await post(`/api/project-invitations/${membership?._id.toString()}/accept`, sub.token);

  const stage = await ProjectStageModel.create({
    project: new Types.ObjectId(projectId), name: 'שלד', order: 0, isGate: false, dependsOn: [],
  });
  // Written like a legacy row — straight into the collection, with no originals — so the backfill
  // leg below has something real to answer about.
  const projectTask = await TaskModel.create({
    kind: 'project', project: new Types.ObjectId(projectId), stage: stage._id,
    company: gc.companyId, createdBy: gc.userId, assignee: sub.userId,
    title: 'יציקה', startDate: new Date(`${iso(20)}T00:00:00.000Z`),
    dueDate: new Date(`${iso(26)}T00:00:00.000Z`), ownCrewOnly: false, delegatorOnSiteRequired: false,
  });

  const refused = await patch(`/api/tasks/${projectTask._id.toString()}`, gc.token, {
    startDate: iso(21), dueDate: iso(27),
  });
  check(refused.status === 409, 'a committed project date still refuses the direct edit', refused.status);
  check(
    (refused.body as { code?: string }).code === 'TASK_EDIT_DATES_NEED_PROPOSAL',
    'naming the proposal flow as the way',
  );

  const requested = await post(`/api/tasks/${projectTask._id.toString()}/date-change`, sub.token, {
    deltaWorkingDays: 5, reason: 'עיכוב ביציקה',
  });
  check(requested.status === 201, 'project-linked scheduling still opens a proposal', requested.status);

  const projectRow = await TaskModel.findById(projectTask._id).lean().exec();
  check(
    projectRow?.dueDate.toISOString().slice(0, 10) === iso(26),
    'and no project schedule moved from any of it',
  );

  section('4. The backfill: agreement originals recovered, standalone baselines set, nothing invented');
  const third = await post('/api/tasks', performer.token, {
    kind: 'standalone', title: 'עבודה שלישית', startDate: iso(30), dueDate: iso(33),
  });
  const thirdId = ((third.body as { task: { id: string } }).task).id;
  await TaskModel.updateOne(
    { _id: new Types.ObjectId(thirdId) },
    { $unset: { originalDatesSource: '' } },
  ).exec();
  await TaskModel.updateMany(
    { _id: { $in: [new Types.ObjectId(soloId), new Types.ObjectId(bornId)] } },
    { $unset: { originalStartDate: '', originalDueDate: '', originalDatesSource: '' } },
  ).exec();

  const snapshot = async () =>
    JSON.stringify(
      await TaskModel.find({})
        .sort({ _id: 1 })
        .select('originalStartDate originalDueDate originalDatesSource startDate dueDate')
        .lean()
        .exec(),
    );
  const legacy = await snapshot();

  const plan = await planOriginalDates();
  check(plan.missing === 3, 'the dry run sees three legacy rows without originals', plan.missing);
  check(plan.fromAgreement.length === 1, 'it plans one agreement recovery', plan.fromAgreement.length);
  check(plan.baseline.length === 1, 'it plans one standalone baseline', plan.baseline.length);
  check(plan.projectLeftUnknown === 1, 'it leaves the project row unknown', plan.projectLeftUnknown);
  check(plan.creationUnmarked.length === 1, 'it finds the stamped row missing its marker', plan.creationUnmarked.length);
  check(plan.conflicts.length === 0, 'it reports no conflicts', plan.conflicts.length);
  check((await snapshot()) === legacy, 'and the dry run wrote nothing');

  const report = await applyOriginalDates('blokta-verify-standalone-dates');
  check(report.agreement.length === 1, 'the agreement-born one recovered its verified originals', report.agreement.length);
  check(report.baseline.length === 1, 'the plain standalone one took a migration baseline', report.baseline.length);
  check(report.creationMarked.length === 1, 'an already-filled creation stamp is marked creation, never baseline', report.creationMarked.length);
  check(
    report.agreement[0] === bornId && report.baseline[0] === soloId && report.creationMarked[0] === thirdId,
    'the manifest names exactly the rows that were written',
  );

  const bornHealed = await TaskModel.findById(bornId).lean().exec();
  check(
    bornHealed?.originalStartDate?.toISOString().slice(0, 10) === iso(10) &&
      bornHealed?.originalDueDate?.toISOString().slice(0, 10) === iso(16) &&
      bornHealed?.originalDatesSource === 'agreement',
    'recovery used the agreement’s dates and says so',
  );
  const soloHealed = await TaskModel.findById(soloId).lean().exec();
  check(
    soloHealed?.originalStartDate?.toISOString().slice(0, 10) === iso(4) &&
      soloHealed?.originalDueDate?.toISOString().slice(0, 10) === iso(9) &&
      soloHealed?.originalDatesSource === 'migration_baseline',
    'the baseline is the current persisted dates, marked as a baseline',
  );
  check(
    soloHealed?.originalStartDate?.toISOString().slice(0, 10) !== iso(2),
    'and it is never presented as recovered creation-time history',
  );
  const soloBaselineView = await detail(soloId, performer.token);
  check(
    soloBaselineView.originalStartDate === iso(4) &&
      soloBaselineView.originalDatesSource === 'migration_baseline',
    'the screen is told it is a baseline, never a verified agreement',
  );
  const thirdHealed = await TaskModel.findById(thirdId).lean().exec();
  check(
    thirdHealed?.originalDatesSource === 'creation' &&
      thirdHealed?.originalStartDate?.toISOString().slice(0, 10) === iso(30),
    'the re-marked row keeps its genuine creation dates',
  );
  const projectUnknown = await TaskModel.findById(projectTask._id).lean().exec();
  check(
    projectUnknown?.originalStartDate === undefined &&
      projectUnknown?.originalDatesSource === undefined,
    'project work gains no invented originals',
  );

  const migrated = await snapshot();
  const again = await applyOriginalDates('blokta-verify-standalone-dates');
  check(
    again.agreement.length + again.baseline.length + again.creationMarked.length === 0 &&
      (await snapshot()) === migrated,
    'a second apply writes nothing — the migration is idempotent',
  );

  const preview = await rollbackOriginalDates(report, false);
  check(
    preview.agreementReverted === 1 && preview.baselineReverted === 1 && preview.creationUnmarked === 1 &&
      (await snapshot()) === migrated,
    'the rollback dry run counts the three rows and writes nothing',
  );
  const undone = await rollbackOriginalDates(report, true);
  check(undone.skipped === 0, 'the rollback reverts every manifest row', undone);
  check((await snapshot()) === legacy, 'and restores the collection exactly to its pre-migration state');

  await applyOriginalDates('blokta-verify-standalone-dates');
  check((await snapshot()) === migrated, 're-applying after a rollback reproduces the same result');

  await finish(harness);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
