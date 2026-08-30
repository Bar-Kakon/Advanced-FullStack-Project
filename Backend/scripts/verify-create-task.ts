/**
 * Drives the real Create Task endpoints over real HTTP.
 *
 * What it proves: creation authority is the project grant and nothing else, naming somebody else
 * needs `task.assign` on top of `task.create`, standalone work is gated on the company code, a
 * project task always names a stage and an active assignee, the project window is a hard refusal
 * while a non-working day is only a warning, and creating work starts neither the task nor the
 * project.
 */
import { Types } from 'mongoose';

import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { ProjectStageModel } from '../src/features/tasks/projectStage.model.js';
import { TaskModel } from '../src/features/tasks/task.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-create-task';

const day = (offset: number): Date => new Date(Date.now() + offset * 86_400_000);
const iso = (offset: number): string => day(offset).toISOString().slice(0, 10);

/** The first date at or after `from` that falls on `utcDay`, so the calendar test is deterministic. */
const isoOnWeekday = (from: number, utcDay: number): string => {
  for (let offset = from; offset < from + 7; offset += 1) {
    if (day(offset).getUTCDay() === utcDay) return iso(offset);
  }
  throw new Error('No such weekday in a seven-day window.');
};

type CreatedBody = {
  task: {
    id: string;
    kind: string;
    projectId: string | null;
    stageId: string | null;
    assigneeId: string | null;
    startDate: string;
    dueDate: string;
    ownCrewOnly: boolean;
    delegatorOnSiteRequired: boolean;
  };
  warnings: { code: string; field: string; date: string }[];
};

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);

  const gc = await createAccount(baseUrl, MARKER, 1);
  const creator = await createAccount(baseUrl, MARKER, 2);
  const worker = await createAccount(baseUrl, MARKER, 3);
  const outsider = await createAccount(baseUrl, MARKER, 4);
  const invitee = await createAccount(baseUrl, MARKER, 5);

  const made = await request(baseUrl, 'POST', '/api/projects', {
    token: gc.token,
    json: {
      name: 'אתר יצירת המשימות',
      startDate: iso(0),
      targetEndDate: iso(120),
      overrunAllowanceDays: 20,
      projectType: 'building',
      size: 'בניין 8 קומות',
    },
  });
  const projectId = (made.body as { project: { id: string } }).project.id;

  const other = await request(baseUrl, 'POST', '/api/projects', {
    token: gc.token,
    json: {
      name: 'אתר אחר',
      startDate: iso(0),
      targetEndDate: iso(90),
      overrunAllowanceDays: 5,
      projectType: 'building',
      size: 'וילה',
    },
  });
  const otherProjectId = (other.body as { project: { id: string } }).project.id;

  const join = async (
    account: { token: string; userId: Types.ObjectId },
    permissions: string[],
    project = projectId,
  ) => {
    await request(baseUrl, 'POST', `/api/projects/${project}/members`, {
      token: gc.token,
      json: { userId: account.userId.toString(), projectRole: 'subcontractor', permissions },
    });
    const row = await ProjectMembershipModel.findOne({ project, user: account.userId }).lean().exec();
    await request(baseUrl, 'POST', `/api/project-invitations/${row?._id.toString()}/accept`, {
      token: account.token,
    });
    return row?._id.toString() ?? '';
  };

  const creatorMembership = await join(creator, ['task.create']);
  await join(worker, []);
  // Invited but never accepted, so this person is a real membership row that is not active.
  await request(baseUrl, 'POST', `/api/projects/${projectId}/members`, {
    token: gc.token,
    json: { userId: invitee.userId.toString(), projectRole: 'professional' },
  });

  const stage = await ProjectStageModel.create({
    project: new Types.ObjectId(projectId),
    name: 'שלד',
    order: 0,
    isGate: true,
    dependsOn: [],
  });
  const foreignStage = await ProjectStageModel.create({
    project: new Types.ObjectId(otherProjectId),
    name: 'גמרים',
    order: 0,
    isGate: false,
    dependsOn: [],
  });

  const workingStart = isoOnWeekday(3, 1);
  const workingDue = isoOnWeekday(20, 2);

  const create = async (token: string, json: Record<string, unknown>) =>
    request(baseUrl, 'POST', '/api/tasks', { token, json });

  const projectTask = (over: Record<string, unknown> = {}) => ({
    kind: 'project',
    projectId,
    stageId: stage._id.toString(),
    assigneeId: worker.userId.toString(),
    title: 'יציקת עמודים',
    startDate: workingStart,
    dueDate: workingDue,
    ...over,
  });

  section('Authentication and D16');
  const anon = await create('', projectTask());
  check(anon.status === 401, 'Without a token creation is 401', anon.status);
  const anonOptions = await request(baseUrl, 'GET', '/api/tasks/create-options');
  check(anonOptions.status === 401, 'The options endpoint needs a token too', anonOptions.status);

  const unreachable = await create(outsider.token, projectTask());
  check(unreachable.status === 404, 'A project the caller cannot reach answers 404', unreachable.status);
  const absent = await create(outsider.token, projectTask({ projectId: new Types.ObjectId().toString() }));
  check(absent.status === 404, 'A project that does not exist answers 404 as well', absent.status);
  check(
    JSON.stringify(unreachable.body) === JSON.stringify(absent.body),
    'Byte-identical — creation never discloses that a project exists',
  );

  section('Q1 — task.create creates, task.assign names somebody else');
  const noGrant = await create(worker.token, projectTask({ assigneeId: worker.userId.toString() }));
  check(noGrant.status === 403, 'A member holding neither code is refused', noGrant.status);
  check(
    (noGrant.body as { code?: string }).code === 'TASK_CREATE_DENIED',
    'and the refusal names task.create',
    (noGrant.body as { code?: string }).code,
  );

  const selfAssigned = await create(creator.token, projectTask({ assigneeId: creator.userId.toString() }));
  check(selfAssigned.status === 201, 'task.create alone opens work for yourself', selfAssigned.status);

  const assignOther = await create(creator.token, projectTask());
  check(assignOther.status === 403, 'task.create alone cannot name another person', assignOther.status);
  check(
    (assignOther.body as { code?: string }).code === 'TASK_ASSIGN_DENIED',
    'and the refusal names task.assign — creation does not walk around it',
    (assignOther.body as { code?: string }).code,
  );

  await request(baseUrl, 'PATCH', `/api/permissions/grants/${creatorMembership}`, {
    token: gc.token,
    json: { permissions: ['task.create', 'task.assign'] },
  });
  const nowAllowed = await create(creator.token, projectTask());
  check(nowAllowed.status === 201, 'With both codes, naming another person succeeds', nowAllowed.status);

  const byFullAuthority = await create(gc.token, projectTask({ title: 'עבודת המנהל' }));
  check(byFullAuthority.status === 201, 'Full Project Authority carries both without listing either', byFullAuthority.status);

  section('Q2 — standalone work is gated on the company code');
  const solo = await create(worker.token, {
    kind: 'standalone',
    title: 'תיקון אצל לקוח',
    startDate: workingStart,
    dueDate: workingDue,
  });
  check(solo.status === 201, 'An owner holding company task.create opens standalone work', solo.status);
  const soloBody = solo.body as CreatedBody;
  check(
    soloBody.task.assigneeId === worker.userId.toString(),
    'Standalone work is self-assigned to its creator',
  );
  check(soloBody.task.projectId === null && soloBody.task.stageId === null, 'and it names no project and no stage');

  const named = await create(worker.token, {
    kind: 'standalone',
    title: 'לא חוקי',
    startDate: workingStart,
    dueDate: workingDue,
    assigneeId: gc.userId.toString(),
  });
  check(named.status === 400, 'Naming an assignee on standalone work is refused, not ignored', named.status);

  await CompanyMembershipModel.updateOne(
    { user: outsider.userId, status: 'active' },
    { $set: { permissions: ['project.create'] } },
  ).exec();
  const ungated = await create(outsider.token, {
    kind: 'standalone',
    title: 'ללא הרשאה',
    startDate: workingStart,
    dueDate: workingDue,
  });
  check(ungated.status === 403, 'Without company task.create standalone work is refused', ungated.status);
  check(
    (ungated.body as { code?: string }).code === 'STANDALONE_CREATE_DENIED',
    'and membership alone never stands in for the grant',
    (ungated.body as { code?: string }).code,
  );

  section('Q3 — a project task always names a stage');
  const stageless = await create(gc.token, { ...projectTask(), stageId: undefined });
  check(stageless.status === 400, 'A project task with no stage is refused', stageless.status);
  const foreign = await create(gc.token, projectTask({ stageId: foreignStage._id.toString() }));
  check(foreign.status === 404, "A stage from another project is not found", foreign.status);

  const madeStage = await request(baseUrl, 'POST', `/api/projects/${projectId}/stages`, {
    token: gc.token,
    json: { name: 'חשמל', isGate: false },
  });
  check(madeStage.status === 201, 'An authorised GC can create a stage', madeStage.status);
  const newStage = (madeStage.body as { stage: { _id: string; order: number } }).stage;
  check(newStage.order === 1, 'and a stage with no order given is appended', newStage.order);

  const stageByMember = await request(baseUrl, 'POST', `/api/projects/${projectId}/stages`, {
    token: creator.token,
    json: { name: 'לא מורשה', isGate: false },
  });
  check(stageByMember.status === 403, 'Someone without project.edit cannot create a stage', stageByMember.status);

  const onNewStage = await create(gc.token, projectTask({ stageId: newStage._id }));
  check(onNewStage.status === 201, 'and the new stage is immediately usable', onNewStage.status);

  section('Q4 — the assignee is required and must be an active member');
  const unassigned = await create(gc.token, { ...projectTask(), assigneeId: undefined });
  check(unassigned.status === 400, 'A project task with no assignee is refused — there is no unassigned state', unassigned.status);
  const stranger = await create(gc.token, projectTask({ assigneeId: outsider.userId.toString() }));
  check(stranger.status === 409, 'Somebody who is not on the project cannot be assigned', stranger.status);
  const notYetAccepted = await create(gc.token, projectTask({ assigneeId: invitee.userId.toString() }));
  check(notYetAccepted.status === 409, 'An invited person who has not accepted cannot be assigned either', notYetAccepted.status);

  section('Q5 — the project window refuses, the calendar only warns');
  const backwards = await create(gc.token, projectTask({ startDate: iso(30), dueDate: iso(20) }));
  check(backwards.status === 400, 'A due date before the start date is refused', backwards.status);
  check((backwards.body as { code?: string }).code === 'DUE_BEFORE_START', 'with its own code');

  const beforeProject = await create(gc.token, projectTask({ startDate: iso(-5), dueDate: iso(30) }));
  check(beforeProject.status === 400, 'Work starting before the project starts is refused', beforeProject.status);
  check(
    (beforeProject.body as { code?: string }).code === 'TASK_OUTSIDE_PROJECT_WINDOW',
    'with the window code',
  );

  const pastCeiling = await create(gc.token, projectTask({ startDate: iso(10), dueDate: iso(141) }));
  check(pastCeiling.status === 400, 'Work due past the overrun ceiling is refused', pastCeiling.status);

  const onCeiling = await create(gc.token, projectTask({ startDate: iso(10), dueDate: iso(140) }));
  check(onCeiling.status === 201, 'and the ceiling itself is reachable — 120 target plus 20 allowance', onCeiling.status);

  const notReal = await create(gc.token, projectTask({ startDate: '2026-02-31' }));
  check(notReal.status === 400, 'A date that matches the pattern but is not real is refused', notReal.status);
  check(
    (notReal.body as { code?: string }).code === 'INVALID_CALENDAR_DATE',
    'by the round-trip, not by the pattern',
  );

  const clean = await create(gc.token, projectTask({ startDate: workingStart, dueDate: workingDue }));
  check((clean.body as CreatedBody).warnings.length === 0, 'A working day produces no warning');

  const saturday = isoOnWeekday(7, 6);
  const onSaturday = await create(gc.token, projectTask({ startDate: saturday, dueDate: workingDue }));
  check(onSaturday.status === 201, 'A non-working day is accepted, not refused', onSaturday.status);
  const warnings = (onSaturday.body as CreatedBody).warnings;
  check(
    warnings.some((w) => w.code === 'NON_WORKING_DAY' && w.field === 'startDate' && w.date === saturday),
    'and it comes back as an advisory warning naming the date',
    warnings,
  );

  section('What creation deliberately does not do');
  const fresh = (clean.body as CreatedBody).task;
  const stored = await TaskModel.findById(fresh.id).lean().exec();
  check(stored?.startedAt === undefined, 'A new task has no startedAt — creating is not starting');
  check(stored?.completedAt === undefined, 'and no completedAt');
  check(!('status' in (stored ?? {})) && !('overdue' in (stored ?? {})), 'and neither a status nor an overdue field');

  const preDelegated = await create(gc.token, projectTask({
    delegation: { delegate: worker.userId.toString(), scope: 'whole' },
  }));
  const preDelegatedStored = await TaskModel.findById((preDelegated.body as CreatedBody).task.id).lean().exec();
  check(
    preDelegatedStored?.delegation === undefined,
    'A delegation supplied at creation never lands — the party above cannot name the performer',
  );

  const withTerms = await create(gc.token, projectTask({ ownCrewOnly: true, delegatorOnSiteRequired: true }));
  const terms = (withTerms.body as CreatedBody).task;
  check(terms.ownCrewOnly && terms.delegatorOnSiteRequired, "and the GC's two commitment terms do persist");

  const project = await request(baseUrl, 'GET', `/api/projects/${projectId}`, { token: gc.token });
  check(
    (project.body as { project: { status: string } }).project.status === 'planned',
    'Creating work does not start the project — only a task actually starting does',
    (project.body as { project: { status: string } }).project.status,
  );

  section('The create-options the screen reads');
  const options = await request(baseUrl, 'GET', '/api/tasks/create-options', { token: creator.token });
  const offered = (options.body as { projects: { id: string; canAssignOthers: boolean }[]; canCreateStandalone: boolean });
  check(
    offered.projects.some((row) => row.id === projectId),
    'A project the caller may create in is offered',
  );
  check(
    offered.projects.every((row) => row.id !== otherProjectId),
    'and a project they hold no task.create in is not',
  );
  check(
    offered.projects.find((row) => row.id === projectId)?.canAssignOthers === true,
    'canAssignOthers follows the task.assign grant',
  );

  const workerOptions = await request(baseUrl, 'GET', '/api/tasks/create-options', { token: worker.token });
  check(
    (workerOptions.body as { projects: unknown[] }).projects.length === 0,
    'Somebody on a project with no task.create is offered nothing',
  );

  const detail = await request(baseUrl, 'GET', `/api/tasks/create-options/${projectId}`, { token: creator.token });
  const window = detail.body as {
    startDate: string;
    endDate: string;
    stages: { id: string }[];
    assignees: { userId: string; name: string }[];
    canManageStages: boolean;
  };
  check(window.startDate === iso(0) && window.endDate === iso(140), 'The window offered is the project start and the ceiling', window);
  check(window.stages.length === 2, 'Both stages are offered', window.stages.length);
  const assignableIds = window.assignees.map((row) => row.userId);
  check(
    assignableIds.includes(worker.userId.toString()) &&
      !assignableIds.includes(invitee.userId.toString()),
    'Only active members are assignable — an unanswered invitation is not',
  );
  check(
    window.assignees.every((row) => row.name.trim().length > 0),
    'and each one arrives with the name the picker prints, so no second call is needed',
  );
  check(window.canManageStages === false, 'and a member without project.edit is told they cannot manage stages');

  const refusedOptions = await request(baseUrl, 'GET', `/api/tasks/create-options/${projectId}`, { token: worker.token });
  check(refusedOptions.status === 403, 'Project options are refused without task.create', refusedOptions.status);

  await cleanUp(MARKER);
  await ProjectStageModel.deleteMany({ project: { $in: [projectId, otherProjectId] } }).exec();
  await finish(harness);
};

void run();
