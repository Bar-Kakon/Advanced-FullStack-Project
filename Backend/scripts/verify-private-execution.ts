/**
 * Private sub-task execution, the private-layer gate, and the delegate's view — over real HTTP on an
 * ISOLATED database.
 *
 * Proves: a sub-task starts once and completes once after starting, persists across reads, and never
 * moves the task it belongs to; a note has no execution; only the layer's owner can read or act on
 * it — the GC, the commissioner, an approved employee of the performer's own company, the delegator
 * (for the delegate's layer) and an outsider all get 404; the task detail tells each viewer whether
 * they have a private layer at all; and the legacy tick still keeps the timestamps coherent.
 *
 *   npm run verify:private-execution
 */
import './support/developmentGuard.js';
import { config as loadEnvFile } from 'dotenv';
import mongoose, { Types } from 'mongoose';

import { CompanyModel } from '../src/features/companies/company.model.js';
import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { PrivateWorkItemModel } from '../src/features/tasks/privateWork.model.js';
import { ProjectStageModel } from '../src/features/tasks/projectStage.model.js';
import { TaskModel } from '../src/features/tasks/task.model.js';
import { createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const verify = (label: string, passed: boolean, detail?: unknown): void => check(passed, label, detail);

const MARKER = 'verify-private-execution';
const iso = (offset: number): string =>
  new Date(Date.UTC(2027, 11, 6) + offset * 86_400_000).toISOString().slice(0, 10);

loadEnvFile({ quiet: true });
if (process.env['MONGODB_URI']) {
  const uri = new URL(process.env['MONGODB_URI']);
  uri.pathname = '/blokta-verify-private-execution';
  process.env['MONGODB_URI'] = uri.toString();
}

interface Item {
  readonly _id: string;
  readonly kind: string;
  readonly body: string;
  readonly done: boolean;
  readonly startedAt?: string;
  readonly completedAt?: string;
}

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await mongoose.connection.dropDatabase();

  const call = (method: string, path: string, token: string, json?: unknown) =>
    request(baseUrl, method, path, { token, ...(json === undefined ? {} : { json }) });
  const items = async (taskId: string, token: string): Promise<Item[]> =>
    ((await call('GET', `/api/tasks/${taskId}/private`, token)).body as { items: Item[] }).items;
  const detail = async (taskId: string, token: string) =>
    (await call('GET', `/api/tasks/${taskId}`, token)).body as {
      task: { state: string; kind: string; project: unknown; viewerIsDelegate: boolean; delegation: unknown; viewer: { hasPrivateLayer: boolean } };
    };

  const gc = await createAccount(baseUrl, MARKER, 1, { contractorCategory: 'main_contractor' });
  const performer = await createAccount(baseUrl, MARKER, 2);
  const delegate = await createAccount(baseUrl, MARKER, 3);
  const commissioner = await createAccount(baseUrl, MARKER, 4);
  const outsider = await createAccount(baseUrl, MARKER, 5);

  const company = await CompanyModel.findById(performer.companyId).lean().exec();
  const seat = await call('POST', '/api/companies/employees/invitations', performer.token, {
    fullName: 'Ella Employee', companyPosition: 'site_manager',
  });
  const employeeEmail = `${MARKER}.employee.${Date.now()}@example.com`;
  await request(baseUrl, 'POST', '/api/auth/register', {
    json: {
      firstName: 'Ella', lastName: 'Employee', email: employeeEmail, password: 'CorrectHorse42!',
      confirmPassword: 'CorrectHorse42!', registrationCategory: 'contractor', specialty: 'electrical',
      city: 'חיפה', region: 'haifa', acceptedTerms: true, operationalEmail: true,
      standing: 'employee', companyName: company?.name, companyPosition: 'site_manager',
    },
  });
  const approved = await call('POST', `/api/companies/employees/${String(seat.body['invitationId'])}/approve`, performer.token);
  const employeeLogin = await request(baseUrl, 'POST', '/api/auth/login', { json: { email: employeeEmail, password: 'CorrectHorse42!' } });
  const employee = String(employeeLogin.body['accessToken'] ?? '');
  verify('an employee of the performer’s own company is approved and signed in', approved.status === 200 && employee.length > 0, approved.status);

  const created = await call('POST', '/api/projects', gc.token, {
    name: 'אתר הביצוע הפרטי', startDate: iso(0), targetEndDate: iso(120),
    overrunAllowanceDays: 30, projectType: 'building', size: 'בניין 3 קומות',
  });
  const projectId = (created.body as { project: { id: string } }).project.id;
  await call('POST', `/api/projects/${projectId}/members`, gc.token, { userId: performer.userId.toString(), projectRole: 'subcontractor' });
  const membership = await ProjectMembershipModel.findOne({ project: new Types.ObjectId(projectId), user: performer.userId }).lean().exec();
  await call('POST', `/api/project-invitations/${membership?._id.toString()}/accept`, performer.token);
  const stage = await ProjectStageModel.create({ project: new Types.ObjectId(projectId), name: 'שלד', order: 0, isGate: false, dependsOn: [] });
  const projectTask = async (title: string) =>
    ((await call('POST', '/api/tasks', gc.token, {
      kind: 'project', projectId, stageId: stage._id.toString(), title,
      assigneeId: performer.userId.toString(), startDate: iso(5), dueDate: iso(10),
    })).body as { task: { id: string } }).task.id;
  const p1 = await projectTask('יציקה');
  const p2 = await projectTask('תיאום מערכות');

  const opened = await call('POST', `/api/conversations/direct/${performer.userId.toString()}`, commissioner.token, { body: 'עבודה' });
  const conversationId = (opened.body as { conversation: { id: string } }).conversation.id;
  await call('POST', `/api/conversations/${conversationId}/accept`, performer.token);
  const proposed = await call('POST', `/api/conversations/${conversationId}/agreements`, commissioner.token, { title: 'התקנה', startDate: iso(20), dueDate: iso(25) });
  const accepted = await call('POST', `/api/conversations/${conversationId}/agreements/${(proposed.body as { message: { id: string } }).message.id}/accept`, performer.token);
  const bornId = (accepted.body as { message: { agreement: { taskId: string } } }).message.agreement.taskId;

  section('1. A sub-task’s execution: start once, complete once after starting, persisted');
  verify('the performer has a private layer on their own work', (await detail(p1, performer.token)).task.viewer.hasPrivateLayer === true);
  const s1 = ((await call('POST', `/api/tasks/${p1}/private`, performer.token, { kind: 'subtask', body: 'סימון מסלול' })).body as { item: Item }).item;
  const n1 = ((await call('POST', `/api/tasks/${p1}/private`, performer.token, { kind: 'note', body: 'להביא מקדחה' })).body as { item: Item }).item;
  verify('a new sub-task has not started', s1.startedAt === undefined && s1.completedAt === undefined && s1.done === false);

  const early = await call('POST', `/api/tasks/${p1}/private/${s1._id}/complete`, performer.token);
  verify('completing before starting is refused (409)', early.status === 409 && early.body['code'] === 'PRIVATE_ITEM_NOT_STARTED', early.body['code']);
  const noteStart = await call('POST', `/api/tasks/${p1}/private/${n1._id}/start`, performer.token);
  verify('a note has no execution to start (409)', noteStart.status === 409 && noteStart.body['code'] === 'PRIVATE_ITEM_NOT_SUBTASK', noteStart.body['code']);

  const started = await call('POST', `/api/tasks/${p1}/private/${s1._id}/start`, performer.token);
  verify('starting it succeeds and stamps the start', started.status === 200 && typeof (started.body as { item: Item }).item.startedAt === 'string', started.status);
  const again = await call('POST', `/api/tasks/${p1}/private/${s1._id}/start`, performer.token);
  verify('it cannot start twice (409)', again.status === 409 && again.body['code'] === 'PRIVATE_ITEM_ALREADY_STARTED', again.body['code']);
  const edited = await call('PATCH', `/api/tasks/${p1}/private/${s1._id}/body`, performer.token, { body: 'סימון מסלול ותוואי' });
  verify('its details stay editable while in progress', edited.status === 200 && (edited.body as { item: Item }).item.body === 'סימון מסלול ותוואי');

  const midway = (await items(p1, performer.token)).find((row) => row._id === s1._id);
  verify('a fresh read shows it in progress', midway?.startedAt !== undefined && midway.completedAt === undefined && midway.done === false);

  const completed = await call('POST', `/api/tasks/${p1}/private/${s1._id}/complete`, performer.token);
  verify('completing it succeeds and stamps the completion', completed.status === 200 && (completed.body as { item: Item }).item.done === true && typeof (completed.body as { item: Item }).item.completedAt === 'string');
  const twice = await call('POST', `/api/tasks/${p1}/private/${s1._id}/complete`, performer.token);
  verify('it cannot complete twice (409)', twice.status === 409 && twice.body['code'] === 'PRIVATE_ITEM_ALREADY_COMPLETED', twice.body['code']);
  const restart = await call('POST', `/api/tasks/${p1}/private/${s1._id}/start`, performer.token);
  verify('a completed sub-task cannot start again (409)', restart.status === 409 && restart.body['code'] === 'PRIVATE_ITEM_ALREADY_COMPLETED', restart.body['code']);

  const after = await items(p1, performer.token);
  const s1After = after.find((row) => row._id === s1._id);
  const n1After = after.find((row) => row._id === n1._id);
  verify('a fresh read shows it completed with both stamps', s1After?.done === true && s1After.startedAt !== undefined && s1After.completedAt !== undefined);
  verify('the note carries no execution at all', n1After?.startedAt === undefined && n1After?.completedAt === undefined);

  const s2 = ((await call('POST', `/api/tasks/${p1}/private`, performer.token, { kind: 'subtask', body: 'קידוח' })).body as { item: Item }).item;
  await call('POST', `/api/tasks/${p1}/private/${s2._id}/start`, performer.token);
  await call('POST', `/api/tasks/${p1}/private/${s2._id}/complete`, performer.token);
  const parent = await TaskModel.findById(p1).lean().exec();
  verify('every sub-task complete — the task itself is untouched', parent?.startedAt === undefined && parent?.completedAt === undefined);
  verify('and still reads as not started', (await detail(p1, performer.token)).task.state === 'not_started');
  const stored = await PrivateWorkItemModel.findById(s1._id).lean().exec();
  verify('no state or status is stored — it is derived from the two stamps', stored !== null && !('state' in stored) && !('status' in stored));

  section('2. Nobody but the owner reaches the layer — every refusal is the same 404');
  const s3 = ((await call('POST', `/api/tasks/${p1}/private`, performer.token, { kind: 'subtask', body: 'פריט פרטי' })).body as { item: Item }).item;
  const probes: Array<[string, string, string]> = [
    ['the GC', gc.token, p1],
    ['an employee of the performer’s company', employee, p1],
    ['an outsider', outsider.token, p1],
  ];
  for (const [who, token, taskId] of probes) {
    const read = await call('GET', `/api/tasks/${taskId}/private`, token);
    const start = await call('POST', `/api/tasks/${taskId}/private/${s3._id}/start`, token);
    const complete = await call('POST', `/api/tasks/${taskId}/private/${s1._id}/complete`, token);
    const edit = await call('PATCH', `/api/tasks/${taskId}/private/${s3._id}/body`, token, { body: 'x' });
    const remove = await call('DELETE', `/api/tasks/${taskId}/private/${s3._id}`, token);
    verify(`${who}: read, start, complete, edit and delete all answer 404`,
      [read, start, complete, edit, remove].every((r) => r.status === 404),
      [read, start, complete, edit, remove].map((r) => r.status));
  }
  const s3After = (await items(p1, performer.token)).find((row) => row._id === s3._id);
  verify('and the item is exactly as the owner left it', s3After?.body === 'פריט פרטי' && s3After.startedAt === undefined);
  verify('the GC’s task view says it has no private layer', (await detail(p1, gc.token)).task.viewer.hasPrivateLayer === false);

  const b1 = ((await call('POST', `/api/tasks/${bornId}/private`, performer.token, { kind: 'subtask', body: 'הזמנת חומר' })).body as { item: Item }).item;
  await call('POST', `/api/tasks/${bornId}/private/${b1._id}/start`, performer.token);
  const commRead = await call('GET', `/api/tasks/${bornId}/private`, commissioner.token);
  const commStart = await call('POST', `/api/tasks/${bornId}/private/${b1._id}/complete`, commissioner.token);
  verify('the commissioner cannot read or act on the performer’s layer (404)', commRead.status === 404 && commStart.status === 404, [commRead.status, commStart.status]);
  const commissioned = JSON.stringify((await call('GET', '/api/tasks/commissioned', commissioner.token)).body);
  verify('the commissioned-work list carries no private data', commissioned.includes(bornId) && !commissioned.includes('הזמנת חומר') && !commissioned.includes('startedAt'));

  section('3. The delegate’s layer is the delegate’s alone; the delegator keeps their own');
  const delegated = await call('POST', `/api/tasks/${p2}/delegation`, performer.token, { userId: delegate.userId.toString(), scope: 'whole' });
  verify('the performer delegates the second task', delegated.status === 201, delegated.status);
  const delegateView = (await detail(p2, delegate.token)).task;
  verify('the delegate has a private layer, and is served no project', delegateView.viewer.hasPrivateLayer === true && delegateView.viewerIsDelegate && delegateView.project === null);
  verify('the delegate is told the real task type', delegateView.kind === 'project');
  const d1 = ((await call('POST', `/api/tasks/${p2}/private`, delegate.token, { kind: 'subtask', body: 'חיווט' })).body as { item: Item }).item;
  const dStart = await call('POST', `/api/tasks/${p2}/private/${d1._id}/start`, delegate.token);
  const dDone = await call('POST', `/api/tasks/${p2}/private/${d1._id}/complete`, delegate.token);
  verify('the delegate starts and completes their own sub-task', dStart.status === 200 && dDone.status === 200);
  verify('the delegator still has a layer of their own', (await detail(p2, performer.token)).task.viewer.hasPrivateLayer === true);
  verify('the delegator reads none of the delegate’s rows', !(await items(p2, performer.token)).some((row) => row._id === d1._id));
  const delegatorActs = await call('POST', `/api/tasks/${p2}/private/${d1._id}/start`, performer.token);
  verify('nor can the delegator act on them (404)', delegatorActs.status === 404, delegatorActs.status);
  const gcOnDelegated = (await detail(p2, gc.token)).task;
  verify('the GC is served no delegation and no private layer', gcOnDelegated.delegation === null && gcOnDelegated.viewer.hasPrivateLayer === false);
  verify('the delegate’s execution moved nothing public', (await detail(p2, performer.token)).task.state === 'not_started');

  section('4. The legacy tick keeps the timestamps coherent');
  const l1 = ((await call('POST', `/api/tasks/${p1}/private`, performer.token, { kind: 'subtask', body: 'פריט ותיק' })).body as { item: Item }).item;
  const ticked = (await call('PATCH', `/api/tasks/${p1}/private/${l1._id}`, performer.token, { done: true })).body as { item: Item };
  verify('ticking completes it and stamps the completion', ticked.item.done === true && ticked.item.completedAt !== undefined);
  const unticked = (await call('PATCH', `/api/tasks/${p1}/private/${l1._id}`, performer.token, { done: false })).body as { item: Item };
  verify('unticking clears both the flag and the stamp', unticked.item.done === false && unticked.item.completedAt === undefined);

  await finish(harness);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
