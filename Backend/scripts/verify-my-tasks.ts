/**
 * Drives the real My Tasks endpoints over real HTTP.
 *
 * What it proves: one queue holds project work and standalone work with the source stored, states
 * and overdue are derived and never stored, only the performer may report, and the delegation wall
 * holds in both directions — the delegate is never told the party above or the project, and the
 * party above is never told the delegate exists.
 */
import { Types } from 'mongoose';

import { CompanyModel } from '../src/features/companies/company.model.js';
import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { CompanyCalendarVersionModel } from '../src/features/calendar/companyCalendarVersion.model.js';
import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { ProjectModel } from '../src/features/projects/project.model.js';
import { TaskModel } from '../src/features/tasks/task.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-my-tasks';

const day = (offset: number): Date => new Date(Date.now() + offset * 86_400_000);
const iso = (offset: number): string => day(offset).toISOString().slice(0, 10);

interface TaskRow {
  id: string;
  kind: string;
  project: { id: string; name: string } | null;
  title: string;
  description: string | null;
  startDate: string;
  dueDate: string;
  state: string;
  overdue: boolean;
  overdueDays: number;
  startedAt: string | null;
  completedAt: string | null;
  counterparty: { userId: string; name: string } | null;
  delegated: boolean;
  viewerIsDelegate: boolean;
  orphaned: boolean;
  canStart: boolean;
  canComplete: boolean;
  pendingProposal: boolean | null;
}

interface PageBody {
  tasks: TaskRow[];
  nextCursor: string | null;
}

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);

  const gc = await createAccount(baseUrl, MARKER, 1);
  const sub = await createAccount(baseUrl, MARKER, 2);
  const delegate = await createAccount(baseUrl, MARKER, 3);
  const stranger = await createAccount(baseUrl, MARKER, 4);

  const project = await request(baseUrl, 'POST', '/api/projects', {
    token: gc.token,
    json: {
      name: 'אתר המשימות',
      startDate: iso(0),
      targetEndDate: iso(120),
      overrunAllowanceDays: 20,
      projectType: 'building',
      size: 'בניין 5 קומות',
    },
  });
  const projectId = (project.body as { project: { id: string } }).project.id;

  const seed = async (fields: Record<string, unknown>) => {
    const created = await TaskModel.create({
      kind: 'project',
      project: new Types.ObjectId(projectId),
      company: gc.companyId,
      createdBy: gc.userId,
      assignee: sub.userId,
      startDate: day(-5),
      dueDate: day(5),
      ...fields,
    });
    return created._id.toString();
  };

  const overdueId = await seed({ title: 'עבודה באיחור', dueDate: day(-3) });
  const runningId = await seed({ title: 'עבודה בביצוע', startedAt: day(-1) });
  const doneId = await seed({ title: 'עבודה שהושלמה', dueDate: day(-9), startedAt: day(-8), completedAt: day(-7) });
  const soloId = await seed({
    kind: 'standalone',
    project: undefined,
    company: undefined,
    createdBy: sub.userId,
    title: 'עבודה עצמאית',
  });
  const wholeId = await seed({
    title: 'עבודה שהועברה במלואה',
    delegation: { delegate: delegate.userId, scope: 'whole', delegatedAt: new Date() },
  });
  const partId = await seed({
    title: 'עבודה שהועברה חלקית',
    description: 'כל החשמל בקומה',
    delegation: {
      delegate: delegate.userId,
      scope: 'part',
      partDescription: 'מעבר הצנרת בלבד',
      delegatedAt: new Date(),
    },
  });

  const listFor = async (token: string, query = ''): Promise<PageBody> => {
    const answer = await request(baseUrl, 'GET', `/api/tasks${query}`, { token });
    return answer.body as unknown as PageBody;
  };
  const rowOf = (page: PageBody, id: string): TaskRow | undefined => page.tasks.find((t) => t.id === id);

  section('Authentication');
  const anon = await request(baseUrl, 'GET', '/api/tasks');
  check(anon.status === 401, 'Without a token My Tasks is 401', anon.status);

  section('One queue, and the source is stored rather than guessed');
  const subPage = await listFor(sub.token);
  check(subPage.tasks.length === 6, 'The assignee sees all six pieces of work', subPage.tasks.length);
  check(rowOf(subPage, soloId)?.kind === 'standalone', 'Standalone work says so');
  check(rowOf(subPage, soloId)?.project === null, 'And carries no project');
  check(rowOf(subPage, overdueId)?.kind === 'project', 'Project work says so');
  check(rowOf(subPage, overdueId)?.project?.id === projectId, 'And names its project');
  check(rowOf(subPage, overdueId)?.project?.name === 'אתר המשימות', 'By name, read from the project itself');

  const storedSolo = await TaskModel.findById(soloId).lean().exec();
  check(storedSolo?.kind === 'standalone', 'The kind is a stored field');
  check(storedSolo?.project === undefined, 'And the project reference is genuinely absent');

  section('State and overdue are derived, never stored');
  check(rowOf(subPage, overdueId)?.state === 'not_started', 'Nothing started is not_started');
  check(rowOf(subPage, runningId)?.state === 'in_progress', 'A start timestamp makes it in_progress');
  check(rowOf(subPage, doneId)?.state === 'completed', 'A completion timestamp makes it completed');
  check(rowOf(subPage, overdueId)?.overdue === true, 'A passed target with no completion is overdue');
  check((rowOf(subPage, overdueId)?.overdueDays ?? 0) === 3, 'And says by how many days', rowOf(subPage, overdueId)?.overdueDays);
  check(rowOf(subPage, doneId)?.overdue === false, 'Completed work is never overdue, however late it was');
  check(rowOf(subPage, runningId)?.overdue === false, 'And a future target is not overdue');
  const storedOverdue = await TaskModel.findById(overdueId).lean().exec();
  check(!('status' in (storedOverdue ?? {})), 'No status field is stored anywhere');
  check(!('overdue' in (storedOverdue ?? {})), 'And overdue is not stored either');

  section('The counterparty, resolved per viewer');
  check(rowOf(subPage, overdueId)?.counterparty?.userId === gc.userId.toString(),
    'An ordinary assignee answers to whoever opened the work');
  check((rowOf(subPage, overdueId)?.counterparty?.name ?? '').length > 0, 'Named, not just an id');
  check(rowOf(subPage, soloId)?.counterparty === null,
    'Work the viewer opened themselves has no counterparty at all');

  section('The delegation wall — what the DELEGATE may see');
  const delegatePage = await listFor(delegate.token);
  check(delegatePage.tasks.length === 2, 'The delegate sees only the work handed to them', delegatePage.tasks.length);
  check(delegatePage.tasks.every((t) => t.viewerIsDelegate), 'And is marked as the performer on both');
  check(rowOf(delegatePage, wholeId)?.counterparty?.userId === sub.userId.toString(),
    'Their counterparty is the DELEGATOR');
  check(rowOf(delegatePage, wholeId)?.counterparty?.userId !== gc.userId.toString(),
    'And is never the party above');
  check(rowOf(delegatePage, wholeId)?.project === null, 'The project is withheld from the delegate');
  check(rowOf(delegatePage, partId)?.description === 'מעבר הצנרת בלבד',
    'Part delegation shows only the part that was handed over',
    rowOf(delegatePage, partId)?.description);
  check(rowOf(delegatePage, partId)?.description !== 'כל החשמל בקומה',
    'Not the parent task’s own description');

  const delegateBody = JSON.stringify(delegatePage);
  check(!delegateBody.includes(gc.userId.toString()), 'MUST-NOT-SEE: the party above appears nowhere in the payload');
  check(!delegateBody.includes(projectId), 'MUST-NOT-SEE: nor the project id');
  check(!delegateBody.includes('אתר המשימות'), 'MUST-NOT-SEE: nor the project name');

  section('The delegation wall — what the PARTY ABOVE may see');
  const gcPage = await listFor(gc.token);
  check(gcPage.tasks.length === 0, 'The GC performs none of this work, so their queue is empty', gcPage.tasks.length);
  check(!JSON.stringify(gcPage).includes(delegate.userId.toString()),
    'MUST-NOT-SEE: the delegate is not named anywhere in it');

  section('The delegator still sees their own arrangement');
  check(rowOf(subPage, wholeId)?.delegated === true, 'The delegator is told the work is delegated');
  check(rowOf(subPage, wholeId)?.viewerIsDelegate === false, 'But is not the performer');
  check(rowOf(subPage, wholeId)?.canStart === false, 'So cannot report progress on it');
  check(rowOf(subPage, overdueId)?.canStart === true, 'While undelegated work is theirs to report');

  section('Unrelated people see nothing');
  const strangerPage = await listFor(stranger.token);
  check(strangerPage.tasks.length === 0, 'Somebody with no standing has an empty queue', strangerPage.tasks.length);
  const strangerStart = await request(baseUrl, 'POST', `/api/tasks/${overdueId}/start`, { token: stranger.token });
  check(strangerStart.status === 404, 'And reporting on a stranger’s task is 404, not 403', strangerStart.status);
  const ghost = await request(baseUrl, 'POST', `/api/tasks/${new Types.ObjectId().toString()}/start`, {
    token: stranger.token,
  });
  check(ghost.status === 404, 'A task that does not exist answers the same', ghost.status);
  check(JSON.stringify(strangerStart.body) === JSON.stringify(ghost.body),
    'Byte-identical — existence is never disclosed (D16)');

  section('Start and Complete — the whole of progress reporting');
  const started = await request(baseUrl, 'POST', `/api/tasks/${overdueId}/start`, { token: sub.token });
  check(started.status === 200, 'The performer may start', started.status);
  check((started.body as { task: TaskRow }).task.state === 'in_progress', 'It becomes in_progress');
  check((started.body as { task: TaskRow }).task.startedAt !== null, 'With a real timestamp');
  const startedTwice = await request(baseUrl, 'POST', `/api/tasks/${overdueId}/start`, { token: sub.token });
  check(startedTwice.status === 409, 'Starting twice is refused', startedTwice.status);
  const firstStamp = (started.body as { task: TaskRow }).task.startedAt;
  const afterDouble = await TaskModel.findById(overdueId).lean().exec();
  check(afterDouble?.startedAt?.toISOString() === firstStamp, 'And the first timestamp is not rewritten');

  const completed = await request(baseUrl, 'POST', `/api/tasks/${overdueId}/complete`, { token: sub.token });
  check(completed.status === 200, 'The performer may complete', completed.status);
  check((completed.body as { task: TaskRow }).task.state === 'completed', 'It becomes completed');
  check((completed.body as { task: TaskRow }).task.overdue === false, 'And stops being overdue');
  const completedTwice = await request(baseUrl, 'POST', `/api/tasks/${overdueId}/complete`, { token: sub.token });
  check(completedTwice.status === 409, 'Completing twice is refused', completedTwice.status);

  const skipStart = await request(baseUrl, 'POST', `/api/tasks/${soloId}/complete`, { token: sub.token });
  check(skipStart.status === 409, 'Completing work that never started is refused', skipStart.status);

  section('Only the performer reports — and on delegated work that is the delegate');
  const delegatorStart = await request(baseUrl, 'POST', `/api/tasks/${wholeId}/start`, { token: sub.token });
  check(delegatorStart.status === 403, 'The delegator cannot report on delegated work', delegatorStart.status);
  const delegateStart = await request(baseUrl, 'POST', `/api/tasks/${wholeId}/start`, { token: delegate.token });
  check(delegateStart.status === 200, 'The delegate can', delegateStart.status);
  const gcStart = await request(baseUrl, 'POST', `/api/tasks/${partId}/start`, { token: gc.token });
  check(gcStart.status === 404, 'And the party above cannot even address it', gcStart.status);

  section('An orphaned task freezes');
  await TaskModel.updateOne(
    { _id: runningId },
    { $set: { orphanedAt: new Date(), previousAssignee: sub.userId }, $unset: { assignee: '' } },
  ).exec();
  const orphanRow = await TaskModel.findById(runningId).lean().exec();
  check(orphanRow?.assignee === undefined, 'The responsible party may be absent');
  check(orphanRow?.previousAssignee?.toString() === sub.userId.toString(),
    'And who it used to be is always preserved');
  const orphanStart = await request(baseUrl, 'POST', `/api/tasks/${runningId}/complete`, { token: sub.token });
  check(orphanStart.status === 404, 'It leaves the former assignee’s queue entirely', orphanStart.status);

  section('The four approved filters, and nothing invented beside them');
  const onlyDone = await listFor(sub.token, '?state=completed');
  check(onlyDone.tasks.every((t) => t.state === 'completed'), 'state=completed returns only completed work');
  check(onlyDone.tasks.length === 2, 'Which is the two now complete', onlyDone.tasks.length);
  const onlySolo = await listFor(sub.token, '?kind=standalone');
  check(onlySolo.tasks.every((t) => t.kind === 'standalone'), 'kind=standalone returns only solo work');
  const byProject = await listFor(sub.token, `?projectId=${projectId}`);
  check(byProject.tasks.every((t) => t.project?.id === projectId), 'projectId returns only that project');
  const noProject = await listFor(sub.token, '?noProject=true');
  check(noProject.tasks.every((t) => t.project === null), 'noProject returns work with no project');
  const conflicting = await request(baseUrl, 'GET', `/api/tasks?projectId=${projectId}&noProject=true`, {
    token: sub.token,
  });
  check(conflicting.status === 400, 'Asking both halves of one control at once is refused', conflicting.status);

  const ascending = await listFor(sub.token, '?sort=due_asc');
  const descending = await listFor(sub.token, '?sort=due_desc');
  check(
    (ascending.tasks[0]?.dueDate ?? '') <= (ascending.tasks.at(-1)?.dueDate ?? ''),
    'Soonest first really is ascending',
  );
  check(
    JSON.stringify(ascending.tasks.map((t) => t.id).reverse()) ===
      JSON.stringify(descending.tasks.map((t) => t.id)),
    'And latest first is the exact reverse',
  );

  section('Paging a long queue');
  const bulk = Array.from({ length: 25 }, (_, i) => ({
    kind: 'standalone' as const,
    createdBy: sub.userId,
    assignee: sub.userId,
    title: `עבודה ${i}`,
    startDate: day(0),
    dueDate: day(30 + i),
  }));
  await TaskModel.insertMany(bulk);

  const seen = new Set<string>();
  let cursor: string | null = null;
  let pages = 0;
  do {
    const page: PageBody = await listFor(sub.token, `?limit=10${cursor ? `&cursor=${cursor}` : ''}`);
    for (const row of page.tasks) seen.add(row.id);
    cursor = page.nextCursor;
    pages += 1;
  } while (cursor !== null && pages < 20);

  // Three, not four: the last full page reports no cursor, so no empty request is ever made.
  check(pages === 3, 'A 30-row queue pages in three requests at limit 10', pages);
  check(seen.size === 30, 'Every row is seen exactly once — no repeats and no gaps', seen.size);

  section('The proposal marker answers from the real domain');
  const anyRow = (await listFor(sub.token)).tasks[0];
  check(anyRow?.pendingProposal === false,
    'With nothing waiting on this viewer the marker is a real false, not a null guess',
    anyRow?.pendingProposal);

  const companies = [gc.companyId, sub.companyId, delegate.companyId, stranger.companyId];
  const owned = await ProjectModel.find({ company: { $in: companies } }).select('_id').lean().exec();
  await TaskModel.deleteMany({
    $or: [
      { project: { $in: owned.map((row) => row._id) } },
      { createdBy: { $in: [gc.userId, sub.userId, delegate.userId, stranger.userId] } },
    ],
  }).exec();
  await ProjectMembershipModel.deleteMany({ project: { $in: owned.map((row) => row._id) } }).exec();
  await CompanyCalendarVersionModel.deleteMany({ company: { $in: companies } }).exec();
  await ProjectModel.deleteMany({ company: { $in: companies } }).exec();
  await CompanyMembershipModel.deleteMany({ company: { $in: companies } }).exec();
  await CompanyModel.deleteMany({ name: new RegExp(`^${MARKER} `) }).exec();
  await cleanUp(MARKER);

  await finish(harness);
};

void run();
