/**
 * The backend leg of the Batch 2 D22 verification, run by `Frontend/scripts/verify-company-calendar.mjs`
 * against its isolated database. Required: MONGODB_URI and LEG (JSON with the accounts and projects).
 */
import './support/developmentGuard.js';
import { setTimeout as sleep } from 'node:timers/promises';
import { config as loadEnvFile } from 'dotenv';
import { Types } from 'mongoose';

import { loadConfig } from '../src/config/env.js';
import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { companyCalendarRepository } from '../src/features/calendar/companyCalendar.repository.js';
import type { Weekday } from '../src/features/calendar/workingCalendar.types.js';
import { companyRepository } from '../src/features/companies/company.repository.js';
import { createCompanyContextService } from '../src/features/companies/companyContext.service.js';
import { companyMembershipRepository } from '../src/features/companies/companyMembership.repository.js';
import { auditRepository } from '../src/features/coordination/audit.repository.js';
import { AuditEntryModel } from '../src/features/coordination/auditEntry.model.js';
import { buildCoordinationService } from '../src/features/coordination/coordination.module.js';
import { RescheduleProposalModel, type ProposalRecord } from '../src/features/coordination/proposal.model.js';
import { proposalRepository } from '../src/features/coordination/proposal.repository.js';
import { createAgreementOriginAdapter } from '../src/features/messaging/agreementOrigin.adapter.js';
import { buildNotificationDispatchService } from '../src/features/notifications/notifications.module.js';
import { projectAccessRepository } from '../src/features/projectaccess/projectAccess.repository.js';
import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { participantRepository } from '../src/features/projectmembers/participant.repository.js';
import { createCalendarChangeService, type CalendarActor } from '../src/features/projects/calendarChange.service.js';
import {
  NO_RECORDED_APPROVALS,
  createCalendarChangeGuard,
  type CalendarChangeApprovals,
  type CalendarChangeGuardDependencies,
  type ProposedCalendarChange,
} from '../src/features/projects/calendarChangeGuard.js';
import { ProjectModel, type ProjectRecord } from '../src/features/projects/project.model.js';
import { projectRepository } from '../src/features/projects/project.repository.js';
import { requireActiveCompany, resolveProjectAccess } from '../src/features/projects/projectAuthorization.js';
import { scheduleWrites } from '../src/features/projects/scheduleWrites.instance.js';
import { ScheduleExceptionModel } from '../src/features/scheduleexceptions/scheduleException.model.js';
import { scheduleExceptionRepository } from '../src/features/scheduleexceptions/scheduleException.repository.js';
import { buildScheduleExceptionService } from '../src/features/scheduleexceptions/scheduleExceptions.module.js';
import { commissionTrackingRepository } from '../src/features/tasks/commissionTracking.repository.js';
import { createDepartureWorkService } from '../src/features/tasks/departureWork.service.js';
import { ProjectStageModel } from '../src/features/tasks/projectStage.model.js';
import { createStagesService } from '../src/features/tasks/stages.service.js';
import { TaskModel, type TaskRecord } from '../src/features/tasks/task.model.js';
import { taskRepository, type TaskRepository } from '../src/features/tasks/task.repository.js';
import { createTaskCreationService } from '../src/features/tasks/taskCreation.service.js';
import { createTaskEditService } from '../src/features/tasks/taskEdit.service.js';
import { userRepository } from '../src/features/users/user.repository.js';
import { runInTransaction } from '../src/db/mongoose.js';

interface LegInput {
  readonly gc: string;
  readonly gcCompany: string;
  readonly i1: string;
  readonly i2: string;
  readonly e1: string;
  readonly e1Company: string;
  readonly week: string;
  readonly projects: Record<'orderA' | 'orderB' | 'noTemp' | 'propCalc' | 'cover' | 'seam', string>;
}

const raw = process.env['LEG'];
if (!raw) {
  console.error('missing LEG');
  process.exit(2);
}
const leg = JSON.parse(raw) as LegInput;

let failures = 0;
let total = 0;
const check = (label: string, passed: boolean, detail = ''): void => {
  total += 1;
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${label.padEnd(100)} ${detail}`);
};
const section = (title: string): void => console.log(`\n${title}`);

const id = (hex: string): Types.ObjectId => new Types.ObjectId(hex);
const gc = id(leg.gc);
const gcCompany = id(leg.gcCompany);
const i1 = id(leg.i1);
const i2 = id(leg.i2);
const e1 = id(leg.e1);
const e1Company = id(leg.e1Company);

const DAY = 86_400_000;
const W = new Date(leg.week);
const weekday = (offset: number): Date => new Date(W.getTime() + offset * DAY);
const SUN_THU = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'] as const;
const SUN_WED = ['sunday', 'monday', 'tuesday', 'wednesday'] as const;
const SUN_TUE = ['sunday', 'monday', 'tuesday'] as const;
const SUN_FRI = [...SUN_THU, 'friday'] as const;

const codeOf = (error: unknown): string =>
  (error as { code?: string }).code ?? `unexpected: ${error instanceof Error ? error.message : String(error)}`;

const attempt = async <T>(work: () => Promise<T>): Promise<{ code: string; value: T | null }> => {
  try {
    return { code: 'OK', value: await work() };
  } catch (error) {
    return { code: codeOf(error), value: null };
  }
};

const background = (work: Promise<unknown>) => {
  const state = { settled: false };
  const outcome = work.then(
    () => {
      state.settled = true;
      return 'OK';
    },
    (error: unknown) => {
      state.settled = true;
      return codeOf(error);
    },
  );
  return { state, outcome };
};

const latch = () => {
  let release: () => void = () => undefined;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { release, released };
};

const load = async (project: Types.ObjectId): Promise<ProjectRecord> => {
  const row = await ProjectModel.findById(project).lean<ProjectRecord>().exec();
  if (row === null) throw new Error(`project ${project.toString()} missing`);
  return row;
};
const revisionOf = async (project: Types.ObjectId): Promise<number> => (await load(project)).scheduleRevision ?? 0;
const overridesOf = async (project: Types.ObjectId): Promise<string> =>
  JSON.stringify((await load(project)).calendarOverrides?.workingDays ?? null);
const calendarAudit = async (project: Types.ObjectId): Promise<{ action: string; details: Record<string, unknown> }[]> =>
  AuditEntryModel.find({ project, action: { $in: ['project.calendar_adopted', 'project.calendar_overrides_changed'] } })
    .sort({ at: 1, _id: 1 })
    .lean<{ action: string; details: Record<string, unknown> }[]>()
    .exec();

const companyContext = createCompanyContextService({
  memberships: companyMembershipRepository,
  companies: companyRepository,
});
const actorFor = async (user: Types.ObjectId, project: ProjectRecord): Promise<CalendarActor> => {
  const authority = requireActiveCompany(await companyContext.forUser(user.toString()), user.toString());
  return {
    id: user,
    access: await resolveProjectAccess({
      projectId: project._id,
      projectCompany: project.company,
      userId: user,
      authority,
      access: projectAccessRepository,
    }),
  };
};

const notifications = buildNotificationDispatchService();
const creationWith = (tasks: TaskRepository) =>
  createTaskCreationService({
    tasks,
    projects: projectRepository,
    access: projectAccessRepository,
    participants: participantRepository,
    calendars: companyCalendarRepository,
    companyContext,
    notifications,
    schedule: scheduleWrites,
  });
const creation = creationWith(taskRepository);
const edit = createTaskEditService({
  projects: projectRepository,
  access: projectAccessRepository,
  companyContext,
  notifications,
  origins: createAgreementOriginAdapter(),
  schedule: scheduleWrites,
});
const stages = createStagesService({ schedule: scheduleWrites });
const coordination = buildCoordinationService();
const exceptions = buildScheduleExceptionService();
const departureWork = createDepartureWorkService({
  tasks: taskRepository,
  origins: createAgreementOriginAdapter(),
  trackings: commissionTrackingRepository,
  access: projectAccessRepository,
  memberships: companyMembershipRepository,
  participants: participantRepository,
  projects: projectRepository,
  audit: auditRepository,
  notifications,
  schedule: scheduleWrites,
});

const guardDependencies: CalendarChangeGuardDependencies = {
  calendars: companyCalendarRepository,
  tasks: taskRepository,
  stages,
  proposals: proposalRepository,
  approvals: NO_RECORDED_APPROVALS,
  exceptions: scheduleExceptionRepository,
  companyMemberships: companyMembershipRepository,
  projectMembers: projectAccessRepository,
};
const calendarWith = (replaced: Partial<CalendarChangeGuardDependencies>) =>
  createCalendarChangeService({
    projects: projectRepository,
    calendars: companyCalendarRepository,
    guard: createCalendarChangeGuard({ ...guardDependencies, ...replaced }),
    audit: auditRepository,
    names: userRepository,
    schedule: scheduleWrites,
  });
const calendar = calendarWith({});

const setOverrides = async (
  service: ReturnType<typeof calendarWith>,
  project: Types.ObjectId,
  workingDays: readonly string[],
): Promise<ProjectRecord> => {
  const loaded = await load(project);
  return service.setOverrides(await actorFor(gc, loaded), loaded, {
    workingDays: [...workingDays] as Weekday[],
  });
};

let stageOrder = 0;
const addStage = async (project: Types.ObjectId, name: string): Promise<Types.ObjectId> =>
  (await ProjectStageModel.create({ project, name, order: (stageOrder += 1), isGate: false, dependsOn: [] }))._id;
const addMember = async (project: Types.ObjectId, user: Types.ObjectId, company: Types.ObjectId): Promise<void> => {
  await ProjectMembershipModel.create({
    project,
    user,
    company,
    status: 'active',
    projectRole: 'subcontractor',
    permissions: [],
    fullAuthority: false,
    invitedBy: gc,
    invitedAt: new Date(),
    respondedAt: new Date(),
  });
};
const addTask = async (
  project: Types.ObjectId,
  stage: Types.ObjectId,
  assignee: Types.ObjectId,
  startDate: Date,
  dueDate: Date,
): Promise<Types.ObjectId> =>
  (
    await taskRepository.create({
      kind: 'project',
      project,
      stage,
      company: gcCompany,
      title: 'leg work',
      createdBy: gc,
      assignee,
      startDate,
      dueDate,
      ownCrewOnly: false,
      delegatorOnSiteRequired: false,
    })
  )._id;
const projectTaskInput = (project: Types.ObjectId, stage: Types.ObjectId, assignee: Types.ObjectId, start: Date, due: Date) => ({
  kind: 'project' as const,
  projectId: project.toString(),
  stageId: stage.toString(),
  title: 'written while another schedule write was in flight',
  assigneeId: assignee.toString(),
  startDate: start,
  dueDate: due,
  ownCrewOnly: false,
  delegatorOnSiteRequired: false,
});

const orderingCalendarFirst = async (): Promise<void> => {
  section('ORDERING — a calendar change holds the claim; a concurrent commitment write waits');
  const P = id(leg.projects.orderA);
  const S = await addStage(P, 'A');
  await addMember(P, e1, e1Company);
  await addTask(P, S, i1, weekday(0), weekday(4));
  const before = await revisionOf(P);

  const inside = latch();
  const hold = latch();
  let gated = false;
  const change = background(
    setOverrides(
      calendarWith({
        tasks: {
          async listOpenInProject(project) {
            const rows = await taskRepository.listOpenInProject(project);
            if (!gated) {
              gated = true;
              inside.release();
              await hold.released;
            }
            return rows;
          },
        },
      }),
      P,
      SUN_WED,
    ),
  );
  await inside.released;

  const write = background(creation.create(gc.toString(), projectTaskInput(P, S, e1, weekday(0), weekday(4))));
  await sleep(700);
  const written = await TaskModel.countDocuments({ project: P, assignee: e1 }).exec();
  check('while the calendar change is being validated, the task creation is held and has written nothing', !write.state.settled && written === 0, `settled=${write.state.settled} rows=${written}`);

  hold.release();
  const changeCode = await change.outcome;
  const writeCode = await write.outcome;
  check('the calendar change, validated on the state it held, is allowed (internal work only)', changeCode === 'OK', changeCode);
  check('the task creation commits after it, so it is created under the new calendar', writeCode === 'OK', writeCode);
  const audit = await calendarAudit(P);
  check('history: one calendar change, counting only the internal task it saw', audit.length === 1 && audit[0]?.details['internalTasksAffected'] === 1, `rows=${audit.length}`);
  check('both writes advanced the schedule revision, one after the other', (await revisionOf(P)) === before + 2, `Δ=${(await revisionOf(P)) - before}`);
};

const orderingCommitmentFirst = async (): Promise<void> => {
  section('ORDERING — a commitment write holds the claim; the calendar change waits and then sees it');
  const P = id(leg.projects.orderB);
  const S = await addStage(P, 'A');
  await addMember(P, e1, e1Company);
  await addTask(P, S, i1, weekday(0), weekday(4));
  const before = await revisionOf(P);

  const inside = latch();
  const hold = latch();
  let gated = false;
  const gatedTasks: TaskRepository = {
    ...taskRepository,
    async create(row, session) {
      if (!gated) {
        gated = true;
        inside.release();
        await hold.released;
      }
      return taskRepository.create(row, session);
    },
  };
  const write = background(creationWith(gatedTasks).create(gc.toString(), projectTaskInput(P, S, e1, weekday(0), weekday(4))));
  await inside.released;

  const change = background(setOverrides(calendar, P, SUN_WED));
  await sleep(700);
  check('while the task creation holds the claim, the calendar change is held and has written nothing', !change.state.settled && (await overridesOf(P)) === 'null', `settled=${change.state.settled}`);

  hold.release();
  const writeCode = await write.outcome;
  const changeCode = await change.outcome;
  check('the task creation commits', writeCode === 'OK', writeCode);
  check('the calendar change then sees the new external task → CALENDAR_CHANGE_NEEDS_APPROVAL', changeCode === 'CALENDAR_CHANGE_NEEDS_APPROVAL', changeCode);
  check('the calendar was never written and no calendar history exists', (await overridesOf(P)) === 'null' && (await calendarAudit(P)).length === 0);
  check('only the task creation advanced the revision (the refused claim rolled back)', (await revisionOf(P)) === before + 1, `Δ=${(await revisionOf(P)) - before}`);
};

const noTemporaryState = async (): Promise<void> => {
  section('NO TEMPORARY STATE — the database stream during a refused and an allowed change');
  const P = id(leg.projects.noTemp);
  const S = await addStage(P, 'A');
  await addMember(P, e1, e1Company);
  await addTask(P, S, e1, weekday(0), weekday(4));

  const events: { operationType: string; updatedFields: string[] }[] = [];
  const stream = ProjectModel.watch([{ $match: { 'documentKey._id': P } }]);
  stream.on('change', (event: { operationType: string; updateDescription?: { updatedFields?: Record<string, unknown> } }) => {
    events.push({
      operationType: event.operationType,
      updatedFields: Object.keys(event.updateDescription?.updatedFields ?? {}),
    });
  });

  await sleep(300);
  await scheduleWrites.run(P, async () => undefined);
  for (let i = 0; i < 50 && events.length === 0; i += 1) await sleep(100);
  check('the stream is live (a probe claim was observed)', events.length === 1, `events=${events.length}`);
  events.length = 0;

  const refused = await attempt(() => setOverrides(calendar, P, SUN_WED));
  await sleep(800);
  check('a change under external work is refused → CALENDAR_CHANGE_NEEDS_APPROVAL', refused.code === 'CALENDAR_CHANGE_NEEDS_APPROVAL', refused.code);
  check('the database emitted no event at all for the project during the refused attempt', events.length === 0, `events=${events.length}`);

  const allowed = await attempt(() => setOverrides(calendar, P, SUN_FRI));
  await sleep(800);
  await stream.close();
  const calendarWrites = events.filter((event) => event.updatedFields.some((field) => field.startsWith('calendarOverrides')));
  check('an allowed change is written exactly once, with its claim, and never rewritten', allowed.code === 'OK' && calendarWrites.length === 1 && events.length === 2, `code=${allowed.code} events=${events.length}`);
  check('the stored calendar is the requested one', (await overridesOf(P)) === JSON.stringify(SUN_FRI));
};

const proposalUnderClaim = async (): Promise<void> => {
  section('CALENDAR-DEPENDENT WRITES — a proposal is computed against the calendar it holds');
  const P = id(leg.projects.propCalc);
  const S = await addStage(P, 'A');
  const task = await addTask(P, S, i1, weekday(7), weekday(10));

  const inside = latch();
  const hold = latch();
  let gated = false;
  const change = background(
    setOverrides(
      calendarWith({
        tasks: {
          async listOpenInProject(project) {
            const rows = await taskRepository.listOpenInProject(project);
            if (!gated) {
              gated = true;
              inside.release();
              await hold.released;
            }
            return rows;
          },
        },
      }),
      P,
      SUN_WED,
    ),
  );
  await inside.released;

  const request = background(coordination.request(gc.toString(), task.toString(), { changes: { deltaWorkingDays: 1 } }));
  await sleep(700);
  const early = await RescheduleProposalModel.countDocuments({ project: P }).exec();
  check('while the calendar change is held, the proposal request has written nothing', !request.state.settled && early === 0, `settled=${request.state.settled} rows=${early}`);

  hold.release();
  const changeCode = await change.outcome;
  const requestCode = await request.outcome;
  check('the calendar change (internal work only) is allowed', changeCode === 'OK', changeCode);
  check('the proposal request then commits', requestCode === 'OK', requestCode);
  const proposal = await RescheduleProposalModel.findOne({ project: P }).lean<ProposalRecord>().exec();
  const due = proposal?.items.find((item) => item.task.equals(task))?.proposedDue;
  check(
    'its proposed due date skips the new day off: next Sunday, not the old Thursday',
    due?.getTime() === weekday(14).getTime(),
    `proposedDue=${due?.toISOString().slice(0, 10)} expected=${weekday(14).toISOString().slice(0, 10)} old=${weekday(11).toISOString().slice(0, 10)}`,
  );
};

const writePathCoverage = async (): Promise<void> => {
  section('WRITE-PATH COVERAGE — each protected write advances the revision in its own transaction');
  const P = id(leg.projects.cover);
  const S1 = await addStage(P, 'S1');
  const S2 = await addStage(P, 'S2');
  await addMember(P, e1, e1Company);
  await addMember(P, i1, gcCompany);
  await addMember(P, i2, gcCompany);

  const measured = async <T>(label: string, expected: number, work: () => Promise<T>, expectedCode = 'OK') => {
    const before = await revisionOf(P);
    const outcome = await attempt(work);
    const delta = (await revisionOf(P)) - before;
    check(label, outcome.code === expectedCode && delta === expected, `code=${outcome.code} Δrevision=${delta}`);
    return outcome.value;
  };

  const created = await measured('task creation (project work)', 1, () =>
    creation.create(gc.toString(), projectTaskInput(P, S1, i1, weekday(7), weekday(10))),
  );
  const task = created === null ? null : id(created.task.id);
  await measured('stage dependency edit (S2 now depends on S1)', 1, () => stages.setDependencies(P, S2.toString(), [S1.toString()]));
  await measured('a dependency that would loop is refused inside the claim and leaves nothing', 0, () => stages.setDependencies(P, S1.toString(), [S2.toString()]), 'STAGE_DEPENDENCY_CYCLE');
  if (task === null) {
    check('the remaining write paths need the created task', false);
    return;
  }
  await measured('a title-only edit is not a schedule write', 0, () => edit.edit(gc.toString(), task.toString(), { title: 'renamed' }));
  await measured('moving the task to another stage', 1, () => edit.edit(gc.toString(), task.toString(), { stageId: S2.toString() }));

  const ceilingTask = await addTask(P, S1, i1, weekday(0), weekday(4));
  const proposalsBefore = await RescheduleProposalModel.countDocuments({ project: P }).exec();
  await measured(
    'a proposal past the project ceiling is refused inside the claim and leaves nothing',
    0,
    () => coordination.request(gc.toString(), ceilingTask.toString(), { changes: { alternativeDue: new Date(Date.now() + 900 * DAY) } }),
    'PROJECT_CEILING_EXCEEDED',
  );
  check('…and no proposal row was written', (await RescheduleProposalModel.countDocuments({ project: P }).exec()) === proposalsBefore);

  const proposal = await measured('proposal request', 1, () =>
    coordination.request(gc.toString(), task.toString(), { changes: { deltaWorkingDays: 1 } }),
  );
  if (proposal === null) return;
  await measured('alternatives requested (adds dates to the proposal)', 1, () =>
    coordination.requestAlternatives(gc.toString(), proposal.id, { note: 'qa' }),
  );
  const options = await coordination.alternatives(gc.toString(), proposal.id);
  const token = options.candidates[0]?.token;
  if (token === undefined) check('an alternative is available to select', false, 'no candidates');
  else await measured('alternative selected (replaces the proposal dates)', 1, () => coordination.selectAlternative(gc.toString(), proposal.id, token));
  await measured('launch changes status only, not dates', 0, () => coordination.launch(gc.toString(), proposal.id));

  const row = await RescheduleProposalModel.findById(proposal.id).lean<ProposalRecord>().exec();
  const item = row?.items.find((entry) => entry.task.equals(task));
  if (item === undefined) {
    check('the proposal carries an item for the task', false);
    return;
  }
  await measured('counter response (adds counter dates)', 1, () =>
    coordination.respond(i1.toString(), proposal.id, item._id.toString(), {
      response: 'countered',
      counterStart: weekday(8),
      counterDue: weekday(11),
    }),
  );
  await measured('resolution applying the counter (+1), then the counter re-cascade (+1)', 2, () =>
    coordination.resolve(gc.toString(), proposal.id, { decisions: [{ itemId: item._id.toString(), resolution: 'counter' }] }),
  );
  const moved = await TaskModel.findById(task).lean<TaskRecord>().exec();
  check('…and the task now carries the counter dates', moved?.startDate.getTime() === weekday(8).getTime() && moved?.dueDate.getTime() === weekday(11).getTime());

  const handoff = await measured('handoff initiated (nothing moves yet)', 0, () =>
    coordination.initiateHandoff(gc.toString(), task.toString(), { toUserId: e1.toString(), completedWorkAtHandover: 'QA handover' }),
  );
  if (handoff !== null) {
    await measured('handoff accepted (the assignee changes)', 1, () => coordination.decideHandoff(e1.toString(), handoff.id, true));
    check('…and the task is now the external professional\'s', (await TaskModel.findById(task).lean<TaskRecord>().exec())?.assignee?.equals(e1) === true);
  }

  const exception = await ScheduleExceptionModel.create({
    project: P,
    kind: 'working',
    scope: 'project',
    fromDate: weekday(5),
    toDate: weekday(5),
    status: 'requested',
    requestedBy: i1,
    requestedAt: new Date(),
    history: [],
  });
  await measured('schedule exception approved', 1, () => exceptions.decide(gc.toString(), exception._id.toString(), true));

  const duty = await addTask(P, S1, i2, weekday(0), weekday(4));
  await measured('departure transfer to another member', 1, () =>
    runInTransaction((session) =>
      departureWork.applyArrangements(gc, gcCompany, i2, { commissions: [], assigned: [{ taskId: duty.toString(), action: 'transfer', assigneeUserId: i1.toString() }] }, session),
    ),
  );
  check('…and the duty is now the other member\'s', (await TaskModel.findById(duty).lean<TaskRecord>().exec())?.assignee?.equals(i1) === true);

  const countBefore = await TaskModel.countDocuments({ project: P }).exec();
  await measured(
    'a failure after the claim and the write rolls both back together',
    0,
    () =>
      scheduleWrites.run(P, async (session) => {
        await taskRepository.create(
          { kind: 'project', project: P, stage: S1, company: gcCompany, title: 'never kept', createdBy: gc, assignee: e1, startDate: weekday(0), dueDate: weekday(4), ownCrewOnly: false, delegatorOnSiteRequired: false },
          session,
        );
        throw Object.assign(new Error('injected'), { code: 'INJECTED' });
      }),
    'INJECTED',
  );
  check('…and the task written inside that transaction does not exist', (await TaskModel.countDocuments({ project: P }).exec()) === countBefore);
};

const approvalsSeam = async (): Promise<void> => {
  section('APPROVALS — the validator asks for exactly this change (test double; production records none)');
  const P = id(leg.projects.seam);
  const S = await addStage(P, 'A');
  await addMember(P, e1, e1Company);
  await addTask(P, S, e1, weekday(0), weekday(4));
  const before = await revisionOf(P);

  const asked: ProposedCalendarChange[] = [];
  const approving = (approver: Types.ObjectId): CalendarChangeApprovals => ({
    async approversOf(change) {
      asked.push(change);
      const exact = change.revision === before && JSON.stringify(change.after.workingDays) === JSON.stringify(SUN_WED);
      return exact ? [approver] : [];
    },
  });

  const wrongPerson = await attempt(() => setOverrides(calendarWith({ approvals: approving(i1) }), P, SUN_WED));
  check('an approval from someone other than the affected professional is not accepted → 409', wrongPerson.code === 'CALENDAR_CHANGE_NEEDS_APPROVAL', wrongPerson.code);
  check('…the calendar and the revision are untouched', (await overridesOf(P)) === 'null' && (await revisionOf(P)) === before);

  const otherChange = await attempt(() => setOverrides(calendarWith({ approvals: approving(e1) }), P, SUN_TUE));
  check('the professional\'s approval of a different change does not cover this one → 409', otherChange.code === 'CALENDAR_CHANGE_NEEDS_APPROVAL', otherChange.code);

  const exact = await attempt(() => setOverrides(calendarWith({ approvals: approving(e1) }), P, SUN_WED));
  const last = asked[asked.length - 1];
  check('the validator passes the revision before its own claim, and the exact before/after', last?.revision === before && JSON.stringify(last?.before.workingDays) === JSON.stringify(SUN_THU) && JSON.stringify(last?.after.workingDays) === JSON.stringify(SUN_WED), `revision=${last?.revision} expected=${before}`);
  check('an approval from that professional for exactly this change → allowed', exact.code === 'OK' && (await overridesOf(P)) === JSON.stringify(SUN_WED), exact.code);

  const none = await attempt(() => setOverrides(calendar, P, SUN_THU));
  check('with the production source (no recorded approvals) the next change is refused → 409', none.code === 'CALENDAR_CHANGE_NEEDS_APPROVAL', none.code);
};

const run = async (): Promise<void> => {
  loadEnvFile({ quiet: true });
  await connectToDatabase(loadConfig().mongoUri);

  await orderingCalendarFirst();
  await orderingCommitmentFirst();
  await noTemporaryState();
  await proposalUnderClaim();
  await writePathCoverage();
  await approvalsSeam();

  console.log(`\nLEG COMPLETE ${total} ${failures}`);
  await disconnectFromDatabase();
  process.exit(failures === 0 ? 0 : 1);
};

run().catch(async (error: unknown) => {
  console.error('ABORTED:', error instanceof Error ? error.stack : error);
  await disconnectFromDatabase().catch(() => undefined);
  process.exit(1);
});
