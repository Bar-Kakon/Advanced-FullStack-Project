/**
 * Drives the real Task Detail endpoints over real HTTP.
 *
 * What it proves: the delegation wall holds in both directions on the detail surface too, a
 * delegate cannot hand work on again, the private layer is invisible to everybody but its owner,
 * stage dependencies refuse to form a loop, and the date-change entry point says the cascade does
 * not exist rather than pretending to accept a request.
 */
import { Types } from 'mongoose';

import { CompanyModel } from '../src/features/companies/company.model.js';
import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { CompanyCalendarVersionModel } from '../src/features/calendar/companyCalendarVersion.model.js';
import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { ProjectModel } from '../src/features/projects/project.model.js';
import { PrivateWorkItemModel } from '../src/features/tasks/privateWork.model.js';
import { ProjectStageModel } from '../src/features/tasks/projectStage.model.js';
import { TaskModel } from '../src/features/tasks/task.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-task-detail';

const day = (offset: number): Date => new Date(Date.now() + offset * 86_400_000);
const iso = (offset: number): string => day(offset).toISOString().slice(0, 10);

interface DetailBody {
  task: {
    id: string;
    project: { id: string; name: string } | null;
    stage: { id: string; name: string; isGate: boolean } | null;
    blockedBy: { id: string; name: string; isGate: boolean }[];
    title: string;
    description: string | null;
    counterparty: { userId: string; name: string } | null;
    delegation: { delegateName: string | null; scope: string; partDescription: string | null } | null;
    viewerIsDelegate: boolean;
    ownCrewOnly: boolean;
    delegatorOnSiteRequired: boolean;
    orphaned: boolean;
    viewer: { canReport: boolean; canDelegate: boolean; canEndDelegation: boolean; canRequestDateChange: boolean };
    rescheduleImpact: number | null;
    rescheduleAvailable: boolean;
  };
}

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);

  const gc = await createAccount(baseUrl, MARKER, 1);
  const sub = await createAccount(baseUrl, MARKER, 2);
  const helper = await createAccount(baseUrl, MARKER, 3);
  const outsider = await createAccount(baseUrl, MARKER, 4);

  const created = await request(baseUrl, 'POST', '/api/projects', {
    token: gc.token,
    json: {
      name: 'אתר הפירוט',
      startDate: iso(0),
      targetEndDate: iso(120),
      overrunAllowanceDays: 20,
      projectType: 'building',
      size: 'בניין 7 קומות',
    },
  });
  const projectId = (created.body as { project: { id: string } }).project.id;

  // The sub is a real member of the project, so their standing is genuine.
  await request(baseUrl, 'POST', `/api/projects/${projectId}/members`, {
    token: gc.token,
    json: { userId: sub.userId.toString(), projectRole: 'subcontractor' },
  });
  const membership = await ProjectMembershipModel.findOne({ project: projectId, user: sub.userId }).lean().exec();
  await request(baseUrl, 'POST', `/api/project-invitations/${membership?._id.toString()}/accept`, {
    token: sub.token,
  });

  const shell = await ProjectStageModel.create({ project: projectId, name: 'שלד', order: 0, isGate: true, dependsOn: [] });
  const electric = await ProjectStageModel.create({ project: projectId, name: 'חשמל', order: 1, isGate: false, dependsOn: [shell._id] });
  const finishing = await ProjectStageModel.create({ project: projectId, name: 'גמרים', order: 2, isGate: false, dependsOn: [electric._id] });

  const task = await TaskModel.create({
    kind: 'project',
    project: new Types.ObjectId(projectId),
    stage: electric._id,
    company: gc.companyId,
    createdBy: gc.userId,
    assignee: sub.userId,
    title: 'העברת צנרת חשמל',
    description: 'כל החשמל בקומה השלישית',
    startDate: day(-2),
    dueDate: day(10),
  });
  const taskId = task._id.toString();

  const detail = async (token: string, id = taskId) => request(baseUrl, 'GET', `/api/tasks/${id}`, { token });

  section('Authentication and D16');
  const anon = await request(baseUrl, 'GET', `/api/tasks/${taskId}`);
  check(anon.status === 401, 'Without a token the detail is 401', anon.status);
  const stranger = await detail(outsider.token);
  check(stranger.status === 404, 'Somebody with no standing gets 404', stranger.status);
  const missing = await detail(outsider.token, new Types.ObjectId().toString());
  check(missing.status === 404, 'A task that does not exist gets 404 too', missing.status);
  check(JSON.stringify(stranger.body) === JSON.stringify(missing.body),
    'Byte-identical — existence is never disclosed');

  section('The detail the responsible party reads');
  const own = await detail(sub.token);
  check(own.status === 200, 'The assignee reads it', own.status);
  const view = (own.body as unknown as DetailBody).task;
  check(view.project?.id === projectId, 'It names the project');
  check(view.stage?.name === 'חשמל', 'And the stage the work sits in', view.stage?.name);
  check(view.counterparty?.userId === gc.userId.toString(), 'The counterparty is whoever opened it');
  check(view.viewer.canReport === true, 'The responsible party may report progress');
  check(view.viewer.canDelegate === true, 'And may hand the work on');

  section('Dependencies run between STAGES, and cannot loop');
  check(view.blockedBy.length === 1, 'The stage names what must finish first', view.blockedBy.length);
  check(view.blockedBy[0]?.name === 'שלד', 'Which is the shell', view.blockedBy[0]?.name);
  check(view.blockedBy[0]?.isGate === true, 'Flagged as a true gate');

  const stored = await TaskModel.findById(taskId).lean().exec();
  check(!('dependencies' in (stored ?? {})), 'No task-level dependency list exists on the task');

  const loop = await request(baseUrl, 'PATCH', `/api/projects/${projectId}/stages/${shell._id.toString()}/dependencies`, {
    token: gc.token,
    json: { dependsOn: [finishing._id.toString()] },
  });
  check(loop.status === 409, 'An edge that would close a loop is refused', loop.status);
  const afterLoop = await ProjectStageModel.findById(shell._id).lean().exec();
  check(afterLoop?.dependsOn.length === 0, 'And nothing was written');

  const selfEdge = await request(baseUrl, 'PATCH', `/api/projects/${projectId}/stages/${shell._id.toString()}/dependencies`, {
    token: gc.token,
    json: { dependsOn: [shell._id.toString()] },
  });
  check(selfEdge.status === 409, 'A stage cannot depend on itself', selfEdge.status);

  const foreign = await request(baseUrl, 'PATCH', `/api/projects/${projectId}/stages/${electric._id.toString()}/dependencies`, {
    token: gc.token,
    json: { dependsOn: [new Types.ObjectId().toString()] },
  });
  check(foreign.status === 409, 'And cannot depend on a stage outside the project', foreign.status);

  const legal = await request(baseUrl, 'PATCH', `/api/projects/${projectId}/stages/${finishing._id.toString()}/dependencies`, {
    token: gc.token,
    json: { dependsOn: [shell._id.toString(), electric._id.toString()] },
  });
  check(legal.status === 200, 'A legal many-to-one edge set is accepted', legal.status);

  // Owner decision 2026-08-30: sequencing is its own grant. Editing the project record and setting
  // the construction order are different powers, so holding one must not confer the other.
  const membershipId = (await ProjectMembershipModel.findOne({ project: projectId, user: sub.userId })
    .lean()
    .exec())?._id.toString();
  const editOnly = await request(baseUrl, 'PATCH', `/api/permissions/grants/${membershipId}`, {
    token: gc.token,
    json: { permissions: ['project.edit'] },
  });
  check(editOnly.status === 200, 'A member is granted project.edit alone', editOnly.status);
  const refusedBySequencing = await request(
    baseUrl,
    'PATCH',
    `/api/projects/${projectId}/stages/${finishing._id.toString()}/dependencies`,
    { token: sub.token, json: { dependsOn: [shell._id.toString()] } },
  );
  check(refusedBySequencing.status === 403,
    'project.edit alone cannot change the construction sequence', refusedBySequencing.status);

  await request(baseUrl, 'PATCH', `/api/permissions/grants/${membershipId}`, {
    token: gc.token,
    json: { permissions: ['project.stage.manage'] },
  });
  const allowedBySequencing = await request(
    baseUrl,
    'PATCH',
    `/api/projects/${projectId}/stages/${finishing._id.toString()}/dependencies`,
    { token: sub.token, json: { dependsOn: [shell._id.toString()] } },
  );
  check(allowedBySequencing.status === 200,
    'and project.stage.manage alone can, without project.edit', allowedBySequencing.status);

  section('Delegation — single level, and the delegator chooses the scope');
  const partial = await request(baseUrl, 'POST', `/api/tasks/${taskId}/delegation`, {
    token: sub.token,
    json: { userId: helper.userId.toString(), scope: 'part', partDescription: 'מעבר הצנרת בלבד' },
  });
  check(partial.status === 201, 'Part of the work may be handed over', partial.status);
  const afterDelegation = (partial.body as unknown as DetailBody).task;
  check(afterDelegation.delegation?.delegateName !== null, 'The delegator is told who performs');
  check(afterDelegation.viewer.canReport === false, 'And stops being the performer');
  check(afterDelegation.viewer.canEndDelegation === true, 'But may end the arrangement');

  const partNoText = await request(baseUrl, 'POST', `/api/tasks/${taskId}/delegation`, {
    token: sub.token,
    json: { userId: helper.userId.toString(), scope: 'part' },
  });
  check(partNoText.status === 409, 'Delegating twice is refused', partNoText.status);

  const helperView = await detail(helper.token);
  check(helperView.status === 200, 'The delegate can read their own work', helperView.status);
  const asDelegate = (helperView.body as unknown as DetailBody).task;
  check(asDelegate.viewerIsDelegate === true, 'And is marked the performer');
  check(asDelegate.project === null, 'MUST-NOT-SEE: the project is withheld');
  check(asDelegate.stage === null, 'MUST-NOT-SEE: and so is the stage');
  check(asDelegate.blockedBy.length === 0, 'MUST-NOT-SEE: and the wider sequence');
  check(asDelegate.description === 'מעבר הצנרת בלבד', 'They see only the part handed over', asDelegate.description);
  check(asDelegate.counterparty?.userId === sub.userId.toString(), 'Their counterparty is the delegator');
  check(asDelegate.delegation?.delegateName === null, 'They are not shown a performer name — they are it');
  const delegateBody = JSON.stringify(helperView.body);
  check(!delegateBody.includes(gc.userId.toString()), 'MUST-NOT-SEE: the party above appears nowhere');
  check(!delegateBody.includes('אתר הפירוט'), 'MUST-NOT-SEE: nor the project name');
  check(!delegateBody.includes('כל החשמל בקומה השלישית'), 'MUST-NOT-SEE: nor the parent description');

  const redelegate = await request(baseUrl, 'POST', `/api/tasks/${taskId}/delegation`, {
    token: helper.token,
    json: { userId: outsider.userId.toString(), scope: 'whole' },
  });
  check(redelegate.status === 409, 'A delegate cannot delegate onward — single level', redelegate.status);
  check(asDelegate.viewer.canDelegate === false, 'And is never offered the control');

  section('The party above is never told');
  const gcView = await detail(gc.token);
  check(gcView.status === 200, 'The GC reads the task through their company standing', gcView.status);
  const asGc = (gcView.body as unknown as DetailBody).task;
  check(asGc.delegation === null, 'MUST-NOT-SEE: the delegation is not disclosed to them');
  check(!JSON.stringify(gcView.body).includes(helper.userId.toString()),
    'MUST-NOT-SEE: the delegate is not named anywhere');
  check(asGc.viewer.canReport === false, 'And the GC is not the performer');

  section('Own-crew-only forbids delegation outright');
  const crewTask = await TaskModel.create({
    kind: 'project', project: new Types.ObjectId(projectId), company: gc.companyId,
    createdBy: gc.userId, assignee: sub.userId, ownCrewOnly: true,
    title: 'עבודה בצוות עצמי', startDate: day(0), dueDate: day(20),
  });
  const crewView = (await detail(sub.token, crewTask._id.toString())).body as unknown as DetailBody;
  check(crewView.task.ownCrewOnly === true, 'The term is on the task');
  check(crewView.task.viewer.canDelegate === false, 'So no delegate control is offered');
  const crewAttempt = await request(baseUrl, 'POST', `/api/tasks/${crewTask._id.toString()}/delegation`, {
    token: sub.token,
    json: { userId: helper.userId.toString(), scope: 'whole' },
  });
  check(crewAttempt.status === 409, 'And the API refuses it too', crewAttempt.status);

  section('The private execution layer belongs to one person');
  const note = await request(baseUrl, 'POST', `/api/tasks/${taskId}/private`, {
    token: helper.token,
    json: { kind: 'note', body: 'להביא מקדחה גדולה' },
  });
  check(note.status === 201, 'The performer keeps private notes', note.status);
  const subTask = await request(baseUrl, 'POST', `/api/tasks/${taskId}/private`, {
    token: helper.token,
    json: { kind: 'subtask', body: 'סימון מסלול' },
  });
  check(subTask.status === 201, 'And private sub-tasks', subTask.status);
  const itemId = (subTask.body as { item: { _id: string } }).item._id;

  const helperItems = await request(baseUrl, 'GET', `/api/tasks/${taskId}/private`, { token: helper.token });
  check((helperItems.body as { items: unknown[] }).items.length === 2, 'They read their own layer');

  const subItems = await request(baseUrl, 'GET', `/api/tasks/${taskId}/private`, { token: sub.token });
  check((subItems.body as { items: unknown[] }).items.length === 0,
    'MUST-NOT-SEE: the delegator sees none of it, though they own the task');
  const gcItems = await request(baseUrl, 'GET', `/api/tasks/${taskId}/private`, { token: gc.token });
  check(gcItems.status === 404, 'MUST-NOT-SEE: and the GC cannot address the layer at all', gcItems.status);

  const ticked = await request(baseUrl, 'PATCH', `/api/tasks/${taskId}/private/${itemId}`, {
    token: helper.token, json: { done: true },
  });
  check(ticked.status === 200, 'A sub-task is a checklist tick', ticked.status);
  const publicAfterTick = (await detail(helper.token)).body as unknown as DetailBody;
  check(publicAfterTick.task.viewer.canReport === true,
    'Ticking it changes nothing about the public state — that is Start and Complete only');
  const storedTask = await TaskModel.findById(taskId).lean().exec();
  check(storedTask?.startedAt === undefined, 'The parent task is still not started');

  const foreignTick = await request(baseUrl, 'PATCH', `/api/tasks/${taskId}/private/${itemId}`, {
    token: sub.token, json: { done: false },
  });
  check(foreignTick.status === 404, 'Nobody else can touch another person’s private item', foreignTick.status);

  section('The date-change entry point is honest');
  check(view.rescheduleAvailable === false, 'The cascade domain reports itself unavailable');
  check(view.rescheduleImpact === null, 'And no impact figure is invented', view.rescheduleImpact);
  check(view.viewer.canRequestDateChange === false, 'So the control is not offered');
  const dateChange = await request(baseUrl, 'POST', `/api/tasks/${taskId}/date-change`, { token: sub.token });
  check(dateChange.status === 503, 'And calling it says so rather than accepting a request', dateChange.status);

  section('Ending a delegation returns responsibility to the delegator');
  const ended = await request(baseUrl, 'DELETE', `/api/tasks/${taskId}/delegation`, { token: sub.token });
  check(ended.status === 200, 'The delegator may end it', ended.status);
  const returned = (ended.body as unknown as DetailBody).task;
  check(returned.delegation === null, 'The arrangement is gone');
  check(returned.viewer.canReport === true, 'And responsibility is back with the delegator');
  const helperAfter = await detail(helper.token);
  check(helperAfter.status === 404, 'The former delegate can no longer reach it', helperAfter.status);

  const companies = [gc.companyId, sub.companyId, helper.companyId, outsider.companyId];
  const owned = await ProjectModel.find({ company: { $in: companies } }).select('_id').lean().exec();
  const ids = owned.map((row) => row._id);
  await PrivateWorkItemModel.deleteMany({}).exec();
  await ProjectStageModel.deleteMany({ project: { $in: ids } }).exec();
  await TaskModel.deleteMany({ project: { $in: ids } }).exec();
  await ProjectMembershipModel.deleteMany({ project: { $in: ids } }).exec();
  await CompanyCalendarVersionModel.deleteMany({ company: { $in: companies } }).exec();
  await ProjectModel.deleteMany({ company: { $in: companies } }).exec();
  await CompanyMembershipModel.deleteMany({ company: { $in: companies } }).exec();
  await CompanyModel.deleteMany({ name: new RegExp(`^${MARKER} `) }).exec();
  await cleanUp(MARKER);

  await finish(harness);
};

void run();
