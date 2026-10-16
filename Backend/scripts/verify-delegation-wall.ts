/**
 * D7: a confidential delegation never, by itself, makes the delegate visible to the project GC —
 * over real HTTP on an ISOLATED database, in the owner's two scenarios.
 *
 *   A. The delegate holds ONLY the confidential delegation. Every payload the GC's screens read
 *      must carry neither the delegate's id nor their name, and no membership may appear.
 *   B. The delegate independently works for the GC (invited member, own assignment) AND receives a
 *      confidential delegation on someone else's task. The GC may see the independent relationship,
 *      but nothing the GC reads may tie the delegate to the delegated task.
 *
 * In both, the delegate really performs the delegated work — starts, completes, keeps a private
 * sub-task — so the check also covers progress, notifications and audit as leak paths.
 *
 *   npm run verify:delegation-wall
 */
import { config as loadEnvFile } from 'dotenv';
import mongoose, { Types } from 'mongoose';

import { ProjectMembershipModel } from '../src/features/projectaccess/projectMembership.model.js';
import { ProjectStageModel } from '../src/features/tasks/projectStage.model.js';
import { createAccount, type Account } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

loadEnvFile({ quiet: true });
if (process.env['MONGODB_URI']) {
  const uri = new URL(process.env['MONGODB_URI']);
  uri.pathname = '/blokta-verify-delegation-wall';
  process.env['MONGODB_URI'] = uri.toString();
}

const verify = (label: string, passed: boolean, detail?: unknown): void => check(passed, label, detail);
const iso = (offset: number): string =>
  new Date(Date.UTC(2027, 11, 6) + offset * 86_400_000).toISOString().slice(0, 10);

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const base = harness.baseUrl;
  await mongoose.connection.dropDatabase();
  const call = (method: string, path: string, token: string, json?: unknown) =>
    request(base, method, path, { token, ...(json === undefined ? {} : { json }) });

  const gil = await createAccount(base, 'verify-delegation-wall', 21, { contractorCategory: 'main_contractor' });
  const shi = await createAccount(base, 'verify-delegation-wall', 32);
  const danaA = await createAccount(base, 'verify-delegation-wall', 43);
  const danaB = await createAccount(base, 'verify-delegation-wall', 54);
  const nameOf = (index: number): string => `Verify Account${index}`;

  const member = async (projectId: string, who: Account) => {
    await call('POST', `/api/projects/${projectId}/members`, gil.token, { userId: who.userId.toString(), projectRole: 'subcontractor' });
    const row = await ProjectMembershipModel.findOne({ project: new Types.ObjectId(projectId), user: who.userId }).lean().exec();
    await call('POST', `/api/project-invitations/${row?._id.toString()}/accept`, who.token);
  };
  const project = async (name: string) => {
    const created = await call('POST', '/api/projects', gil.token, {
      name, startDate: iso(0), targetEndDate: iso(120), overrunAllowanceDays: 30, projectType: 'building', size: 'בניין',
    });
    const id = (created.body as { project: { id: string } }).project.id;
    const stage = await ProjectStageModel.create({ project: new Types.ObjectId(id), name: 'שלד', order: 0, isGate: false, dependsOn: [] });
    return { id, stage: stage._id.toString() };
  };
  const task = async (projectId: string, stageId: string, title: string, assignee: Account) =>
    ((await call('POST', '/api/tasks', gil.token, {
      kind: 'project', projectId, stageId, title, assigneeId: assignee.userId.toString(), startDate: iso(1), dueDate: iso(9),
    })).body as { task: { id: string } }).task.id;
  const performAsDelegate = async (taskId: string, delegate: Account) => {
    const item = ((await call('POST', `/api/tasks/${taskId}/private`, delegate.token, { kind: 'subtask', body: 'תכנון פנימי' })).body as { item: { _id: string } }).item;
    await call('POST', `/api/tasks/${taskId}/private/${item._id}/start`, delegate.token);
    await call('POST', `/api/tasks/${taskId}/private/${item._id}/complete`, delegate.token);
    const started = await call('POST', `/api/tasks/${taskId}/start`, delegate.token);
    const completed = await call('POST', `/api/tasks/${taskId}/complete`, delegate.token);
    return started.status === 200 && completed.status === 200;
  };

  /** Everything the GC's screens read, fetched as the GC. */
  const gilReads = async (projectId: string, delegatedTask: string, ratee: Account) => {
    const reads: Array<[string, string]> = [
      ['project', `/api/projects/${projectId}`],
      ['project dashboard', `/api/projects/${projectId}/dashboard`],
      ['project members', `/api/projects/${projectId}/members`],
      ['project stages', `/api/projects/${projectId}/stages`],
      ['project proposals', `/api/coordination/projects/${projectId}/proposals`],
      ['project audit', `/api/coordination/projects/${projectId}/audit`],
      ['delegated task detail', `/api/tasks/${delegatedTask}`],
      ['delegated task handoff view', `/api/coordination/tasks/${delegatedTask}/handoff`],
      ['GC task list', '/api/tasks?limit=50'],
      ['GC commissioned work', '/api/tasks/commissioned'],
      ['GC pending actions', '/api/coordination/pending-actions'],
      ['GC notifications', '/api/notifications?limit=50'],
      ['GC conversations', '/api/conversations?folder=inbox&limit=50'],
      ['GC rating eligibility for the delegate', `/api/ratings/eligible-works/${ratee.userId.toString()}`],
    ];
    const out: Array<{ label: string; status: number; text: string }> = [];
    for (const [label, path] of reads) {
      const res = await call('GET', path, gil.token);
      out.push({ label, status: res.status, text: JSON.stringify(res.body) });
    }
    const rooms = (JSON.parse(out.find((r) => r.label === 'GC conversations')!.text) as { conversations?: { id: string; kind: string }[] }).conversations ?? [];
    for (const room of rooms.filter((r) => r.kind === 'project_room')) {
      const res = await call('GET', `/api/conversations/${room.id}/messages?limit=50`, gil.token);
      out.push({ label: 'project room messages', status: res.status, text: JSON.stringify(res.body) });
    }
    return out;
  };

  section('A. The delegate holds ONLY the confidential delegation');
  const pa = await project('פרויקט א');
  await member(pa.id, shi);
  const ta = await task(pa.id, pa.stage, 'עבודה מואצלת א', shi);
  const delegatedA = await call('POST', `/api/tasks/${ta}/delegation`, shi.token, { userId: danaA.userId.toString(), scope: 'part', partDescription: 'חלק מהעבודה' });
  verify('Shi delegates part of his task to Dana-A', delegatedA.status === 201, delegatedA.status);
  verify('the delegation created no project membership for Dana-A',
    (await ProjectMembershipModel.countDocuments({ project: new Types.ObjectId(pa.id), user: danaA.userId }).exec()) === 0);
  verify('Dana-A performs it — private sub-task, start, complete', await performAsDelegate(ta, danaA));
  const readsA = await gilReads(pa.id, ta, danaA);
  verify('every GC read answered', readsA.every((r) => r.status === 200 || r.label.startsWith('GC rating')), readsA.map((r) => `${r.label}:${r.status}`));
  const leaksA = readsA.filter((r) => r.text.includes(danaA.userId.toString()) || r.text.includes(nameOf(43)));
  verify('no GC payload carries Dana-A’s id or name', leaksA.length === 0, leaksA.map((r) => r.label));
  const detailA = JSON.parse(readsA.find((r) => r.label === 'delegated task detail')!.text) as { task: { delegation: unknown; viewerIsDelegate: boolean; state: string } };
  verify('the GC is served no delegation on the delegated task', detailA.task.delegation === null && detailA.task.viewerIsDelegate === false);
  verify('the GC still sees the shared progress (completed)', detailA.task.state === 'completed', detailA.task.state);
  const membersA = readsA.find((r) => r.label === 'project members')!.text;
  verify('the project member list names Shi and not Dana-A', membersA.includes(shi.userId.toString()) && !membersA.includes(danaA.userId.toString()));
  verify('no GC payload mentions a delegate or a delegation by value',
    readsA.every((r) => !/"delegateName":"|"viewerIsDelegate":true|"delegation":\{/.test(r.text)));
  const auditA = JSON.parse(readsA.find((r) => r.label === 'project audit')!.text) as { entries?: { action: string; actorName: string }[] };
  const earlyA = (auditA.entries ?? []).filter((e) => e.action === 'stage.early_completion');
  verify('the delegated task closed its stage early — the audit names the delegator Shi, never Dana-A',
    earlyA.length === 1 && earlyA[0]?.actorName === nameOf(32), earlyA);
  const directA = await call('GET', `/api/tasks/${ta}/private`, gil.token);
  verify('the GC is refused Dana-A’s private layer (404)', directA.status === 404, directA.status);

  section('B. Dana-B independently works for the GC AND receives a confidential delegation from Shi');
  const pb = await project('פרויקט ב');
  await member(pb.id, shi);
  await member(pb.id, danaB);
  const ownB = await task(pb.id, pb.stage, 'העבודה של דנה עצמה', danaB);
  const stageTwo = await ProjectStageModel.create({ project: new Types.ObjectId(pb.id), name: 'גמר', order: 1, isGate: false, dependsOn: [] });
  const tb = await task(pb.id, stageTwo._id.toString(), 'העבודה של שי', shi);
  const delegatedB = await call('POST', `/api/tasks/${tb}/delegation`, shi.token, { userId: danaB.userId.toString(), scope: 'whole' });
  verify('Shi delegates his whole task to Dana-B', delegatedB.status === 201, delegatedB.status);
  const membershipsB = await ProjectMembershipModel.find({ project: new Types.ObjectId(pb.id), user: danaB.userId }).lean().exec();
  verify('Dana-B still has exactly the one membership the GC created — delegation added nothing',
    membershipsB.length === 1 && membershipsB[0]?.invitedBy?.toString() === gil.userId.toString());
  await call('POST', `/api/tasks/${ownB}/start`, danaB.token);
  await call('POST', `/api/tasks/${ownB}/complete`, danaB.token);
  verify('Dana-B performs the delegated work', await performAsDelegate(tb, danaB));
  const readsB = await gilReads(pb.id, tb, danaB);
  const membersB = readsB.find((r) => r.label === 'project members')!.text;
  verify('the GC sees Dana-B as the member he invited (the independent relationship)', membersB.includes(danaB.userId.toString()));
  const ownView = await call('GET', `/api/tasks/${ownB}`, gil.token);
  verify('the GC sees Dana-B’s own assignment as hers', ownView.status === 200 && JSON.stringify(ownView.body).includes('העבודה של דנה עצמה'));
  const tbReads = readsB.filter((r) => r.label === 'delegated task detail' || r.label === 'delegated task handoff view');
  verify('the delegated task’s detail and handoff view carry neither Dana-B’s id nor name',
    tbReads.every((r) => !r.text.includes(danaB.userId.toString()) && !r.text.includes(nameOf(54))), tbReads.map((r) => r.label));
  const detailB = JSON.parse(tbReads[0]!.text) as { task: { delegation: unknown; viewerIsDelegate: boolean; state: string } };
  verify('the GC is served no delegation on Shi’s task', detailB.task.delegation === null && detailB.task.viewerIsDelegate === false);
  const tied = readsB.filter((r) => {
    const body = JSON.parse(r.text) as unknown;
    const hits: string[] = [];
    const walk = (node: unknown): void => {
      if (Array.isArray(node)) node.forEach(walk);
      else if (node !== null && typeof node === 'object') {
        const text = JSON.stringify(node);
        const own = Object.values(node as Record<string, unknown>).some((v) => v === tb);
        if (own && (text.includes(danaB.userId.toString()) || text.includes(nameOf(54)))) hits.push(text.slice(0, 120));
        Object.values(node as Record<string, unknown>).forEach(walk);
      }
    };
    walk(body);
    return hits.length > 0;
  });
  verify('no GC payload places Dana-B on Shi’s task anywhere', tied.length === 0, tied.map((r) => r.label));
  const auditB = JSON.parse(readsB.find((r) => r.label === 'project audit')!.text) as { entries?: { action: string; actorName: string; task?: string | null; taskId?: string | null; details?: { stage?: string } }[] };
  const earlyB = (auditB.entries ?? []).filter((e) => e.action === 'stage.early_completion');
  const earlyByStage = (stage: string) => earlyB.find((e) => e.details?.stage === stage);
  verify('Dana-B’s OWN stage completing early is attributed to her — the independent relationship', earlyByStage('שלד')?.actorName === nameOf(54), earlyB);
  verify('Shi’s delegated stage completing early is attributed to Shi, never to Dana-B', earlyByStage('גמר')?.actorName === nameOf(32), earlyB);
  const notesB = JSON.parse(readsB.find((r) => r.label === 'GC notifications')!.text) as { notifications: { taskId: string | null; payload: unknown }[] };
  verify('no GC notification about Shi’s task names Dana-B',
    notesB.notifications.filter((n) => n.taskId === tb).every((n) => !JSON.stringify(n).includes(nameOf(54)) && !JSON.stringify(n).includes(danaB.userId.toString())));
  const eligible = readsB.find((r) => r.label.startsWith('GC rating'))!;
  verify('the GC’s rating eligibility for Dana-B never offers Shi’s delegated task', !eligible.text.includes(tb), eligible.status);
  verify('no GC payload mentions a delegate or a delegation by value',
    readsB.every((r) => !/"delegateName":"|"viewerIsDelegate":true|"delegation":\{/.test(r.text)));
  const directB = await call('GET', `/api/tasks/${tb}/private`, gil.token);
  verify('the GC is refused Dana-B’s private layer (404)', directB.status === 404, directB.status);

  await finish(harness);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
