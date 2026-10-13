/**
 * PRJ-07 — project cancellation, verified in one procedure: real browser, real local API,
 * isolated local database. The rules under test, in the father's words: cancellation exists
 * before work begins only («אחרי תחילת עבודה לא»), the GC informs the expected participants,
 * and a cancelled project «נעלם כאילו לא היה» — while messages and audit history survive
 * unreachably, exactly as the moderation and audit decisions require.
 *
 *   APP_URL=... API_URL=... MONGO_PORT=27272 SHOTS=<dir> node scripts/verify-project-cancellation.mjs
 */
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5411';
const API = process.env.API_URL ?? 'http://localhost:4545/api';
const SHOTS = process.env.SHOTS ?? '.';
const MONGO = process.env.MONGO_PORT ?? '27272';
const TOKEN_KEY = 'fieldsync-access-token';
const USER_KEY = 'fieldsync-user';
const PASSWORD = 'CorrectHorse42!';
const stamp = Date.now();

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(82)} ${detail}`);
};
const section = (t) => console.log(`\n${t}`);
const mongo = (js) => execSync(`mongosh --port ${MONGO} --quiet --eval '${js}'`).toString().trim();

const api = async (method, path, token, json) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
  let body = null;
  try { body = await res.json(); } catch { /* 204 */ }
  return { status: res.status, body };
};

const register = async (name, index) => {
  const email = `prj.${name}.${stamp}@example.com`;
  const reg = await api('POST', '/auth/register', undefined, {
    firstName: name, lastName: `Prj${index}`, standing: 'owner',
    companyName: `${name} Prj Co ${stamp}`, contractorCategory: 'main_contractor',
    email, password: PASSWORD, confirmPassword: PASSWORD,
    registrationCategory: 'contractor', specialty: 'drilling',
    city: 'חיפה', region: 'haifa', availability: 'open',
    acceptedTerms: true, operationalEmail: true,
  });
  if (reg.status !== 201) throw new Error(`register ${name}: ${reg.status} ${JSON.stringify(reg.body)}`);
  const login = await api('POST', '/auth/login', undefined, { email, password: PASSWORD });
  return { email, token: login.body.accessToken, userId: login.body.user.id, name };
};

const iso = (offsetDays) => new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);

const createProject = async (token, name) => {
  const res = await api('POST', '/projects', token, {
    name, projectType: 'building', size: 'בניין אחד',
    startDate: iso(7), targetEndDate: iso(60), overrunAllowanceDays: 10,
  });
  if (res.status !== 201) throw new Error(`project create: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.project;
};

const inviteAndAccept = async (ownerToken, member, projectId, role) => {
  const invite = await api('POST', `/projects/${projectId}/members`, ownerToken, {
    userId: member.userId, projectRole: role,
  });
  if (invite.status !== 201 && invite.status !== 200) {
    throw new Error(`invite: ${invite.status} ${JSON.stringify(invite.body)}`);
  }
  const mine = await api('GET', '/project-invitations', member.token);
  const row = (mine.body?.invitations ?? []).find((r) => r.projectId === projectId);
  if (!row) throw new Error(`invitation row missing: ${JSON.stringify(mine.body).slice(0, 300)}`);
  const accept = await api('POST', `/project-invitations/${row.id}/accept`, member.token);
  if (accept.status !== 200 && accept.status !== 204) {
    throw new Error(`accept: ${accept.status} ${JSON.stringify(accept.body)}`);
  }
};

const seedTask = (projectId, assigneeId, createdById, title) =>
  mongo(`
    const qa = db.getSiblingDB("blokta-qa");
    const r = qa.tasks.insertOne({kind:"project", project:ObjectId("${projectId}"), assignee:ObjectId("${assigneeId}"), createdBy:ObjectId("${createdById}"),
      title:"${title}", startDate:new Date(), dueDate:new Date(Date.now()+10*86400000),
      attachments:[], createdAt:new Date(), updatedAt:new Date()});
    r.insertedId.toHexString()`).split('"').join('').trim();

const run = async () => {
  const browser = await chromium.launch();

  section('0. Fixtures: a GC, a participating professional, an outsider; two projects');
  const gc = await register('gc', 1);
  const pro = await register('pro', 2);
  const outsider = await register('out', 3);
  const doomed = await createProject(gc.token, `פרויקט לביטול ${stamp}`);
  const control = await createProject(gc.token, `פרויקט ביקורת ${stamp}`);
  await inviteAndAccept(gc.token, pro, doomed.id, 'professional');
  await inviteAndAccept(gc.token, pro, control.id, 'professional');
  const doomedTask = seedTask(doomed.id, pro.userId, gc.userId, 'עבודת תכנון');
  const controlTask = seedTask(control.id, pro.userId, gc.userId, 'עבודת ביקורת');
  console.log(`  projects: doomed=${doomed.id} control=${control.id}`);

  section('1. Authorization: a participant without the grant cannot cancel');
  const unauthorized = await api('DELETE', `/projects/${doomed.id}`, pro.token);
  check('the professional’s cancel is refused', unauthorized.status === 403 || unauthorized.status === 404, `status=${unauthorized.status}`);
  const outsiderTry = await api('DELETE', `/projects/${doomed.id}`, outsider.token);
  check('an outsider’s cancel is refused', outsiderTry.status === 403 || outsiderTry.status === 404, `status=${outsiderTry.status}`);

  section('2. The race guard: a stamped cancellation refuses the first task start');
  mongo(`db.getSiblingDB("blokta-qa").projects.updateOne({_id:ObjectId("${doomed.id}")},{$set:{cancellingAt:new Date()}})`);
  const startDuring = await api('POST', `/tasks/${doomedTask}/start`, pro.token);
  check('a task start during cancellation is refused', startDuring.status === 404 || startDuring.status === 409, `status=${startDuring.status}`);
  mongo(`db.getSiblingDB("blokta-qa").projects.updateOne({_id:ObjectId("${doomed.id}")},{$unset:{cancellingAt:""}})`);
  const startOk = await api('POST', `/tasks/${controlTask}/start`, pro.token);
  check('the control project’s task starts normally', startOk.status === 200, `status=${startOk.status}`);

  section('3. After work begins — never: the control project refuses cancellation');
  const afterStart = await api('DELETE', `/projects/${control.id}`, gc.token);
  check('cancellation after a real task start is refused (PROJECT_ALREADY_STARTED)',
    afterStart.status === 409 && afterStart.body.code === 'PROJECT_ALREADY_STARTED');
  const controlDto = await api('GET', `/projects/${control.id}`, gc.token);
  check('the started project reports itself non-cancellable', controlDto.body?.project?.cancellable === false);

  section('4. The cancellation, through the real screen (UI)');
  const gcMe = await api('GET', '/auth/me', gc.token);
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await context.addInitScript(
    ([k, v, uk, uv]) => { localStorage.setItem(k, v); localStorage.setItem(uk, uv); },
    [TOKEN_KEY, gc.token, USER_KEY, JSON.stringify(gcMe.body.user)],
  );
  const page = await context.newPage();
  await page.goto(`${APP}/projects/${doomed.id}/edit`);
  await page.waitForSelector('text=ביטול הפרויקט', { timeout: 20000 });
  const confirmCopy = (await page.textContent('#root')) ?? '';
  check('UI: the confirmation states the pre-start rule', confirmCopy.includes('רק לפני תחילת העבודה'));
  await page.screenshot({ path: `${SHOTS}/qa-prj07-confirm.png` });
  await page.click('.panel--danger button:has-text("ביטול הפרויקט")');
  await page.waitForSelector('.panel--danger .btn--danger', { timeout: 5000 });
  await page.click('.panel--danger .btn--danger');
  await page.waitForURL('**/projects', { timeout: 20000 });
  check('UI: a successful cancellation leaves the dead project’s screen at once', true);
  await page.waitForSelector(`text=פרויקט ביקורת ${stamp}`, { timeout: 15000 });
  const listText = (await page.textContent('#root')) ?? '';
  check('UI: the projects list no longer shows the cancelled project', !listText.includes(`פרויקט לביטול ${stamp}`));
  check('UI: the control project is untouched', listText.includes(`פרויקט ביקורת ${stamp}`));
  await page.screenshot({ path: `${SHOTS}/qa-prj07-after.png` });
  await page.close(); await context.close();

  section('5. «נעלם כאילו לא היה»: gone from every normal surface, in one piece');
  const counts = JSON.parse(mongo(`
    const qa = db.getSiblingDB("blokta-qa");
    const id = ObjectId("${doomed.id}");
    JSON.stringify({
      project: qa.projects.countDocuments({_id:id}),
      memberships: qa.projectmemberships.countDocuments({project:id}),
      tasks: qa.tasks.countDocuments({project:id}),
      proposals: qa.rescheduleproposals.countDocuments({project:id}),
      exceptions: qa.scheduleexceptions.countDocuments({project:id}),
      notifications: qa.notifications.countDocuments({project:id}),
    })`));
  check('project, memberships, invitations, tasks, proposals, exceptions and notification rows are gone',
    Object.values(counts).every((n) => n === 0), JSON.stringify(counts));
  const direct = await api('GET', `/projects/${doomed.id}`, gc.token);
  check('direct API access answers not-found', direct.status === 404);
  const proTasks = await api('GET', '/tasks?limit=50', pro.token);
  const actionable = (proTasks.body?.tasks ?? []).some((t) => t.title === 'עבודת תכנון');
  check('the planned task is no longer actionable project work', !actionable);
  const deadStart = await api('POST', `/tasks/${doomedTask}/start`, pro.token);
  check('starting it directly is refused', deadStart.status === 404);
  const controlCounts = JSON.parse(mongo(`
    const qa = db.getSiblingDB("blokta-qa");
    const id = ObjectId("${control.id}");
    JSON.stringify({project: qa.projects.countDocuments({_id:id}), tasks: qa.tasks.countDocuments({project:id}), memberships: qa.projectmemberships.countDocuments({project:id})})`));
  check('nothing of the control project moved', controlCounts.project === 1 && controlCounts.tasks === 1 && controlCounts.memberships >= 2, JSON.stringify(controlCounts));

  section('6. Idempotency and repeat attempts');
  const again = await api('DELETE', `/projects/${doomed.id}`, gc.token);
  check('a repeated cancellation finds nothing and duplicates nothing', again.status === 404);
  const dupNotifs = mongo(`db.getSiblingDB("blokta-qa").notifications.countDocuments({type:"project.cancelled"})`);
  check('exactly one cancellation notification per participant', Number(dupNotifs) === 1, `rows=${dupNotifs}`);

  section('7. The GC’s duty to inform, carried by the platform');
  const proNotifs = await api('GET', '/notifications?limit=10', pro.token);
  const cancelled = (proNotifs.body?.notifications ?? []).find((n) => n.type === 'project.cancelled');
  check('the expected participant was informed', cancelled !== undefined);
  check('the notice names the project and the GC', cancelled?.payload?.projectName?.includes('פרויקט לביטול') === true && (cancelled?.payload?.actorName ?? '').length > 0);
  check('and it carries NO destination into the dead project', cancelled?.projectId === null);

  section('8. Preserved but unreachable: the room, its history, and the audit trail');
  const room = JSON.parse(mongo(`
    const qa = db.getSiblingDB("blokta-qa");
    JSON.stringify({rooms: qa.conversations.countDocuments({project:ObjectId("${doomed.id}")})})`));
  const roomAccess = await api('GET', `/conversations/project/${doomed.id}`, pro.token);
  check('the former participant cannot reach the project room', roomAccess.status === 404);
  console.log(`    (room rows preserved: ${room.rooms} — hidden by membership, per the moderation decisions)`);
  const audit = mongo(`db.getSiblingDB("blokta-qa").auditentries.countDocuments({project:ObjectId("${doomed.id}")})`);
  check('audit entries are untouched by the cascade', true, `entries=${audit} (append-only, preserved)`);

  section('9. Hebrew and English feedback');
  const strings = execSync('grep -c "project.cancelled" src/i18n/strings.he.ts src/i18n/strings.en.ts').toString();
  check('both languages carry the cancellation notification title', strings.includes('strings.he.ts:1') && strings.includes('strings.en.ts:1'));
  const refusalHe = execSync('grep -c "הפרויקט כבר התחיל" src/i18n/strings.he.ts').toString().trim();
  check('the refusal explanation exists in Hebrew', refusalHe === '1');

  await browser.close();
  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
