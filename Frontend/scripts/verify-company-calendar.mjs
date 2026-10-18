/**
 * Batch 2 (CAL-03 company calendar editor, standard hours, the temporary D22 guard), on an isolated
 * local stack. The script starts its own API with dummy secrets from a folder holding no .env, so no
 * real credential is ever loaded. Required: APP_URL, API_PORT, MONGO_PORT, MONGO_REPLSET, DB_NAME,
 * BACKEND_LOG, BACKEND_DIR, RUN_DIR.
 */
import './support/developmentGuard.mjs';
import { execSync, spawn, spawnSync } from 'node:child_process';
import { closeSync, openSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const need = (name) => {
  const value = process.env[name];
  if (!value) { console.error(`missing ${name}`); process.exit(2); }
  return value;
};
const APP = need('APP_URL');
const API_PORT = need('API_PORT');
const API = `http://localhost:${API_PORT}/api`;
const MONGO = need('MONGO_PORT');
const REPLSET = need('MONGO_REPLSET');
const DB = need('DB_NAME');
const BACKEND_LOG = need('BACKEND_LOG');
const BACKEND_DIR = need('BACKEND_DIR');
const RUN_DIR = need('RUN_DIR');
const URI = `mongodb://127.0.0.1:${MONGO}/${DB}?replicaSet=${REPLSET}`;

const PASSWORD = 'CorrectHorse42!';
const stamp = Date.now();
const mail = (tag) => `cal.${tag}.${stamp}@example.com`;

let failures = 0;
let passes = 0;
const check = (label, passed, detail = '') => {
  if (passed) passes += 1; else failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(100)} ${detail}`);
};
const section = (title) => console.log(`\n${title}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const BASE_ENV = {
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  NODE_ENV: 'development',
  MONGODB_URI: URI,
  CORS_ORIGINS: APP,
  FRONTEND_URL: APP,
  API_PUBLIC_URL: `http://localhost:${API_PORT}`,
  TERMS_VERSION: 'qa',
  ACCESS_TOKEN_TTL_SECONDS: '900',
  REFRESH_TOKEN_TTL_SECONDS: '1209600',
  ACCESS_TOKEN_SECRET: 'qa-access-secret-0123456789abcdef0123456789abcdef0123456789',
  REFRESH_TOKEN_SECRET: 'qa-refresh-secret-0123456789abcdef0123456789abcdef0123456789',
};

let apiProcess = null;
const healthy = async () => { try { return (await fetch(`${API}/health`)).ok; } catch { return false; } };
const startApi = async () => {
  const log = openSync(BACKEND_LOG, 'a');
  apiProcess = spawn(`${BACKEND_DIR}/node_modules/.bin/tsx`, [`${BACKEND_DIR}/src/server.ts`], {
    cwd: RUN_DIR, detached: true, stdio: ['ignore', log, log], env: { ...BASE_ENV, PORT: API_PORT },
  });
  closeSync(log);
  for (let i = 0; i < 120 && !(await healthy()); i += 1) await sleep(500);
  if (!(await healthy())) throw new Error('the API did not become healthy');
};
const stopApi = async () => {
  if (apiProcess === null) return;
  const exited = new Promise((resolve) => apiProcess.once('exit', resolve));
  try { process.kill(-apiProcess.pid, 'SIGTERM'); } catch { /* already gone */ }
  await Promise.race([exited, sleep(8000)]);
  apiProcess = null;
};

const call = async (method, path, { token, body } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  return { status: res.status, body: json };
};

const mongo = (js) =>
  execSync(`mongosh --port ${MONGO} --quiet --eval '${js.replaceAll("'", `'\\''`)}'`).toString().trim();
const query = (expression) =>
  JSON.parse(mongo(`const d = db.getSiblingDB("${DB}"); print(EJSON.stringify(${expression}, { relaxed: true }))`));
const run = (statement) => mongo(`const d = db.getSiblingDB("${DB}"); ${statement}`);
const O = (hex) => `ObjectId("${hex}")`;
const D = (date) => `new Date("${date.toISOString()}")`;

const DAY = 86_400_000;
const utcDay = (at) => new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()));
const today = utcDay(new Date());
const W = (() => { let at = new Date(today.getTime() + 7 * DAY); while (at.getUTCDay() !== 0) at = new Date(at.getTime() + DAY); return at; })();
const weekday = (offset) => new Date(W.getTime() + offset * DAY);
const isoDay = (at) => at.toISOString().slice(0, 10);

const SUN_THU = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const SUN_WED = ['sunday', 'monday', 'tuesday', 'wednesday'];
const SUN_FRI = [...SUN_THU, 'friday'];
const SUN_WED_FRI = [...SUN_WED, 'friday'];

const owner = (given, email) => ({
  firstName: given, lastName: 'בדיקה', standing: 'owner', companyName: `${given} Co ${stamp}`,
  email, registrationCategory: 'supplier', specialty: 'stone_supplier', password: PASSWORD, confirmPassword: PASSWORD,
  city: 'חיפה', region: 'haifa', availability: 'open', acceptedTerms: true, operationalEmail: false,
});
const register = async (tag, given) => {
  const email = mail(tag);
  const answer = await call('POST', '/auth/register', { body: owner(given, email) });
  if (answer.status !== 201) throw new Error(`register ${tag}: ${answer.status}`);
  const user = query(`d.users.findOne({ email: ${JSON.stringify(email)} }, { _id: 1 })`)._id.$oid;
  const company = query(`d.companymemberships.findOne({ user: ${O(user)} }, { company: 1 })`).company.$oid;
  return { tag, email, id: user, company };
};
const login = async (person) => (await call('POST', '/auth/login', { body: { email: person.email, password: PASSWORD } })).body?.accessToken ?? null;

const insertTask = ({ project, company, createdBy, assignee, start, due, completed = false, orphaned = false }) =>
  run(`print(d.tasks.insertOne({ kind: "project", project: ${O(project)}, company: ${O(company)}, title: "QA work",
    createdBy: ${O(createdBy)}, ${assignee ? `assignee: ${O(assignee)},` : ''} startDate: ${D(start)}, dueDate: ${D(due)},
    ${completed ? `startedAt: ${D(start)}, completedAt: ${D(due)},` : ''} ${orphaned ? `orphanedAt: new Date(), previousAssignee: ${O(createdBy)},` : ''}
    ownCrewOnly: false, delegatorOnSiteRequired: false, createdAt: new Date(), updatedAt: new Date() }).insertedId.toHexString())`);
const addMember = (project, user, company, invitedBy, permissions = []) =>
  run(`d.projectmemberships.insertOne({ project: ${O(project)}, user: ${O(user)}, ${company ? `company: ${O(company)},` : ''}
    status: "active", projectRole: "subcontractor", permissions: ${JSON.stringify(permissions)}, fullAuthority: false,
    invitedBy: ${O(invitedBy)}, invitedAt: new Date(), respondedAt: new Date(), createdAt: new Date(), updatedAt: new Date() })`);
const projectState = (project) =>
  query(`d.projects.findOne({ _id: ${O(project)} }, { calendarVersion: 1, calendarOverrides: 1, calendarAdoptions: 1, updatedAt: 1 })`);
const snapshot = (project) => JSON.stringify(query(`({
  tasks: d.tasks.find({ project: ${O(project)} }, { startDate: 1, dueDate: 1, assignee: 1, completedAt: 1, orphanedAt: 1 }).sort({ _id: 1 }).toArray(),
  proposals: d.rescheduleproposals.find({ project: ${O(project)} }).sort({ _id: 1 }).toArray(),
  members: d.projectmemberships.find({ project: ${O(project)} }, { user: 1, status: 1, permissions: 1, company: 1 }).sort({ _id: 1 }).toArray() })`));
const auditActions = (project) =>
  query(`d.auditentries.find({ project: ${O(project)} }).sort({ at: 1, _id: 1 }).toArray()`);

const overrides = async (token, project, body) => call('PUT', `/projects/${project}/calendar/overrides`, { token, body });
const created = { names: [] };

const runVerification = async () => {
  await startApi();
  console.log('  (API started with dummy secrets; no .env was loaded)');

  section('SETUP — accounts, company relationships and projects (isolated database)');
  const GC = await register('gc', 'גדי');
  const E1 = await register('external', 'אורי');
  const I1 = await register('employee', 'עידו');
  const I2 = await register('nogrant', 'ענת');
  const R1 = await register('representative', 'רונית');
  const F1 = await register('former.stale', 'פזית');
  const F2 = await register('former.elsewhere', 'פנחס');
  for (const person of [I1, I2, R1]) {
    run(`d.companymemberships.updateOne({ user: ${O(person.id)} }, { $set: { company: ${O(GC.company)}, standing: "employee", status: "active", permissions: [] } })`);
  }
  run(`d.companymemberships.updateOne({ user: ${O(F1.id)} }, { $set: { company: ${O(GC.company)}, standing: "employee", status: "inactive", leftAt: new Date(), permissions: [] } })`);
  run(`d.companymemberships.insertOne({ company: ${O(GC.company)}, user: ${O(F2.id)}, standing: "employee", status: "inactive", leftAt: new Date(), permissions: [], createdAt: new Date(), updatedAt: new Date() })`);
  run(`d.users.updateOne({ _id: ${O(GC.id)} }, { $set: { planCode: "premium" } })`);
  check('seven accounts registered; three employees and two former employees placed in the GC company', true);

  const gc = await login(GC);
  const r1 = await login(R1);
  const i2 = await login(I2);
  check('GC, the representative and the employee without a grant sign in', Boolean(gc && r1 && i2));

  const newProject = async (name) => {
    const answer = await call('POST', '/projects', { token: gc, body: {
      name: `${name} ${stamp}`, projectType: 'building', size: '3 קומות',
      startDate: isoDay(new Date(today.getTime() + DAY)), targetEndDate: isoDay(new Date(today.getTime() + 150 * DAY)),
      overrunAllowanceDays: 30,
    } });
    if (answer.status !== 201) throw new Error(`project ${name}: ${answer.status} ${JSON.stringify(answer.body)}`);
    created.names.push(answer.body.project.name);
    return answer.body.project.id;
  };
  const P = {};
  for (const key of ['ext', 'int', 'mix', 'stale', 'formerExt', 'overdue', 'clean', 'prop', 'uiInt', 'race']) P[key] = await newProject(key);
  check('ten projects created through the API, each pinned to the company calendar', Object.keys(P).length === 10);
  const v1 = projectState(P.ext).calendarVersion.$oid;
  check('every project is pinned to the same first company version', Object.values(P).every((id) => projectState(id).calendarVersion.$oid === v1));

  const week = { start: weekday(0), due: weekday(4) };
  addMember(P.ext, E1.id, E1.company, GC.id);
  const extTask = insertTask({ project: P.ext, company: GC.company, createdBy: GC.id, assignee: E1.id, ...week });
  insertTask({ project: P.int, company: GC.company, createdBy: GC.id, assignee: I1.id, ...week });
  addMember(P.int, R1.id, GC.company, GC.id, ['project.calendar.manage']);
  addMember(P.mix, E1.id, E1.company, GC.id);
  insertTask({ project: P.mix, company: GC.company, createdBy: GC.id, assignee: I1.id, ...week });
  insertTask({ project: P.mix, company: GC.company, createdBy: GC.id, assignee: E1.id, ...week });
  addMember(P.stale, F1.id, GC.company, GC.id);
  const staleTask = insertTask({ project: P.stale, company: GC.company, createdBy: GC.id, assignee: F1.id, ...week });
  addMember(P.formerExt, F2.id, F2.company, GC.id);
  insertTask({ project: P.formerExt, company: GC.company, createdBy: GC.id, assignee: F2.id, ...week });
  addMember(P.overdue, E1.id, E1.company, GC.id);
  insertTask({ project: P.overdue, company: GC.company, createdBy: GC.id, assignee: E1.id,
    start: new Date(today.getTime() - 10 * DAY), due: new Date(today.getTime() - 3 * DAY) });
  addMember(P.clean, E1.id, E1.company, GC.id);
  insertTask({ project: P.clean, company: GC.company, createdBy: GC.id, assignee: E1.id, ...week, completed: true });
  insertTask({ project: P.clean, company: GC.company, createdBy: GC.id, ...week, orphaned: true });
  insertTask({ project: P.clean, company: GC.company, createdBy: GC.id, ...week });
  const propTask = insertTask({ project: P.prop, company: GC.company, createdBy: GC.id, assignee: I1.id, ...week });
  run(`d.rescheduleproposals.insertOne({ project: ${O(P.prop)}, initiatingTask: ${O(propTask)}, requestedBy: ${O(GC.id)},
    changes: {}, status: "open", responseHours: 72, items: [{ _id: new ObjectId(), task: ${O(propTask)}, respondent: ${O(I1.id)},
    currentStart: ${D(weekday(0))}, currentDue: ${D(weekday(4))}, proposedStart: ${D(weekday(1))}, proposedDue: ${D(weekday(4))},
    reason: "initiating", response: "pending", resolution: "none", excluded: false }], createdAt: new Date(), updatedAt: new Date() })`);
  insertTask({ project: P.uiInt, company: GC.company, createdBy: GC.id, assignee: I1.id, ...week });
  addMember(P.race, E1.id, E1.company, GC.id);
  check(`commitments seeded for the week of ${isoDay(W)} (Sunday–Thursday windows)`, true);

  const before = Object.fromEntries(Object.entries(P).map(([key, id]) => [key, snapshot(id)]));

  section('D22 GUARD — an external professional (direct API calls)');
  let answer = await overrides(gc, P.ext, { workingDays: SUN_FRI });
  check('adding Friday, outside the external work window → allowed', answer.status === 200, `status=${answer.status}`);
  answer = await overrides(gc, P.ext, { workingDays: SUN_WED_FRI });
  check('making Thursday a day off inside that window → 409 CALENDAR_CHANGE_NEEDS_APPROVAL',
    answer.status === 409 && answer.body?.code === 'CALENDAR_CHANGE_NEEDS_APPROVAL' && /external/.test(answer.body?.message ?? ''), `status=${answer.status}`);
  answer = await overrides(gc, P.ext, { workingDays: SUN_FRI, hours: { startMinute: 360, endMinute: 900 } });
  check('changing the hours under the external work → 409', answer.status === 409, `status=${answer.status}`);
  answer = await overrides(gc, P.ext, { workingDays: SUN_FRI, sector: 'arab' });
  check('changing only the sector (no computed date changes) → allowed', answer.status === 200, `status=${answer.status}`);
  const extOverrides = projectState(P.ext).calendarOverrides;
  check('the refused requests left the project overrides exactly as the last allowed change',
    JSON.stringify(extOverrides?.workingDays) === JSON.stringify(SUN_FRI) && extOverrides?.sector === 'arab' && extOverrides?.hours?.startMinute === undefined);
  run(`d.scheduleexceptions.insertOne({ project: ${O(P.ext)}, kind: "working", scope: "task", task: ${O(extTask)}, professional: ${O(E1.id)},
    fromDate: ${D(weekday(4))}, toDate: ${D(weekday(4))}, status: "approved", requestedBy: ${O(E1.id)}, requestedAt: new Date(),
    approvedBy: ${O(GC.id)}, approvedAt: new Date(), history: [], createdAt: new Date(), updatedAt: new Date() })`);
  answer = await overrides(gc, P.ext, { workingDays: SUN_WED_FRI, sector: 'arab' });
  check('with an approved working exception on that Thursday, the same day-off change → allowed', answer.status === 200, `status=${answer.status}`);
  const extAudit = auditActions(P.ext);
  check('every allowed override change is in the audit history, none of the refused ones',
    extAudit.length === 3 && extAudit.every((row) => row.action === 'project.calendar_overrides_changed'), extAudit.map((r) => r.action).join(','));
  check('the history names the actor and keeps the before and after overrides',
    extAudit[0]?.actor?.$oid === GC.id && extAudit[0]?.details?.after?.workingDays?.length === 6 && extAudit[0]?.parties?.length === 0);

  section('D22 GUARD — internal employees, the representative, and permissions');
  answer = await overrides(gc, P.int, { workingDays: SUN_WED });
  check('GC makes Thursday a day off under an internal employee\'s work → allowed', answer.status === 200, `status=${answer.status}`);
  check('the history counts the internal task covered under the GC\'s authority', auditActions(P.int)[0]?.details?.internalTasksAffected === 1);
  answer = await overrides(r1, P.int, { workingDays: SUN_WED, hours: { startMinute: 360, endMinute: 900 } });
  check('a representative holding project.calendar.manage changes the hours → allowed', answer.status === 200, `status=${answer.status}`);
  answer = await overrides(i2, P.int, { workingDays: SUN_THU });
  check('an employee without the grant → 403, before any assessment', answer.status === 403, `status=${answer.status} ${answer.body?.code}`);
  answer = await overrides(null, P.int, { workingDays: SUN_THU });
  check('no session → 401', answer.status === 401, `status=${answer.status}`);
  answer = await overrides(gc, P.mix, { workingDays: SUN_WED });
  check('mixed internal and external commitments → 409 (external)', answer.status === 409 && /external/.test(answer.body?.message ?? ''), `status=${answer.status}`);

  section('D22 GUARD — former employees, overdue, finished and unassigned work');
  answer = await overrides(gc, P.stale, { workingDays: SUN_WED });
  check('a stale assignment to a former employee who joined as staff → 409 (responsibility), not external',
    answer.status === 409 && /Responsibility/.test(answer.body?.message ?? ''), `status=${answer.status}`);
  run(`d.tasks.updateOne({ _id: ${O(staleTask)} }, { $unset: { assignee: "" }, $set: { orphanedAt: new Date(), previousAssignee: ${O(F1.id)} } })`);
  answer = await overrides(gc, P.stale, { workingDays: SUN_WED });
  check('after the work is moved to awaiting reassignment, the same change → allowed', answer.status === 200, `status=${answer.status}`);
  answer = await overrides(gc, P.formerExt, { workingDays: SUN_WED });
  check('a former employee now taking part through another business → 409 (external)',
    answer.status === 409 && /external/.test(answer.body?.message ?? ''), `status=${answer.status}`);
  answer = await overrides(gc, P.overdue, { workingDays: SUN_FRI });
  check('overdue unfinished external work (remaining days unknown) → 409, conservatively', answer.status === 409, `status=${answer.status}`);
  answer = await overrides(gc, P.clean, { workingDays: SUN_WED });
  check('only completed, orphaned and unassigned work → allowed', answer.status === 200, `status=${answer.status}`);

  section('D22 GUARD — an unresolved schedule proposal');
  const proposalBefore = JSON.stringify(query(`d.rescheduleproposals.find({ project: ${O(P.prop)} }).toArray()`));
  answer = await overrides(gc, P.prop, { workingDays: SUN_WED });
  check('a change inside the proposal\'s span (internal work only) → 409 (proposals)',
    answer.status === 409 && /proposals/.test(answer.body?.message ?? ''), `status=${answer.status}`);
  answer = await overrides(gc, P.prop, { workingDays: SUN_FRI });
  check('adding Friday, outside the proposal\'s span → allowed', answer.status === 200, `status=${answer.status}`);
  check('the proposal was neither recalculated nor touched',
    JSON.stringify(query(`d.rescheduleproposals.find({ project: ${O(P.prop)} }).toArray()`)) === proposalBefore);

  section('CAL-03 — the company calendar API, versions and isolation');
  answer = await call('GET', '/calendar/company', { token: gc });
  check('GC reads the company calendar: version 1, 07:00–16:00, Sunday–Thursday',
    answer.status === 200 && answer.body?.current?.version === 1 && answer.body?.current?.config?.hours?.startMinute === 420, `status=${answer.status}`);
  answer = await call('GET', '/calendar/company', { token: i2 });
  check('an employee without company.manage reads it too', answer.status === 200 && answer.body?.current?.version === 1);
  const v2Config = { workingDays: SUN_THU, hours: { startMinute: 390, endMinute: 930 }, sector: 'jewish', worksCholHaMoed: false, worksMemorialDays: false };
  answer = await call('PUT', '/calendar/company', { token: i2, body: v2Config });
  check('an employee without company.manage → 403 with a calendar-specific message',
    answer.status === 403 && answer.body?.code === 'COMPANY_PERMISSION_DENIED' && /calendar/.test(answer.body?.message ?? ''), `status=${answer.status}`);
  answer = await call('PUT', '/calendar/company', { body: v2Config });
  check('no session → 401', answer.status === 401);
  answer = await call('PUT', '/calendar/company', { token: gc, body: { ...v2Config, hours: { startMinute: 960, endMinute: 420 } } });
  check('hours ending before they start → 400', answer.status === 400 && answer.body?.code === 'REQUEST_VALIDATION_FAILED', `status=${answer.status}`);
  answer = await call('PUT', '/calendar/company', { token: gc, body: v2Config });
  check('GC saves 06:30–15:30 → a new immutable version 2', answer.status === 201 && answer.body?.version === 2, `status=${answer.status}`);
  answer = await call('GET', '/calendar/company', { token: gc });
  const v1Row = answer.body?.versions?.find((row) => row.version === 1);
  check('version 2 is current and stores 06:30–15:30', answer.body?.current?.version === 2 && answer.body?.current?.config?.hours?.startMinute === 390);
  check('version 1 is unchanged (still 07:00–16:00)', v1Row?.config?.hours?.startMinute === 420 && v1Row?.config?.hours?.endMinute === 960);
  check('no existing project moved: all ten stay pinned to version 1', Object.values(P).every((id) => projectState(id).calendarVersion.$oid === v1));
  answer = await call('GET', '/projects/calendar/outdated', { token: gc });
  check('the outdated count and the named list reach a company manager',
    answer.body?.outdated === 10 && answer.body?.projects?.length === 10, `outdated=${answer.body?.outdated}`);
  answer = await call('GET', '/projects/calendar/outdated', { token: i2 });
  check('an employee gets the count only, no project names', answer.body?.outdated === 10 && answer.body?.projects === null);

  section('ADOPTION — explicit, guarded and recorded');
  answer = await call('GET', `/projects/${P.ext}`, { token: gc });
  check('the external project previews a lock on adoption (external)', answer.body?.project?.calendar?.adoptionImpact?.keepOverrides?.lock === 'external');
  answer = await call('GET', `/projects/${P.uiInt}`, { token: gc });
  check('the internal project previews no lock and counts its internal task',
    answer.body?.project?.calendar?.adoptionImpact?.keepOverrides?.lock === null && answer.body?.project?.calendar?.adoptionImpact?.keepOverrides?.internal === 1);
  answer = await call('GET', `/projects/${P.uiInt}`, { token: i2 });
  check('someone without the calendar grant gets no preview at all', answer.status === 200 && answer.body?.project?.calendar?.adoptionImpact === null);
  answer = await call('POST', `/projects/${P.ext}/calendar/adopt`, { token: gc, body: { keepOverrides: true } });
  check('adopting version 2 on the external project (hours change) → 409', answer.status === 409, `status=${answer.status}`);
  check('…and its pin and adoption history did not move', projectState(P.ext).calendarVersion.$oid === v1 && projectState(P.ext).calendarAdoptions.length === 0);
  answer = await call('POST', `/projects/${P.clean}/calendar/adopt`, { token: gc, body: { keepOverrides: true } });
  check('adopting on the project with no live commitments → allowed', answer.status === 200, `status=${answer.status}`);
  const cleanState = projectState(P.clean);
  check('the pin moved to version 2 and one adoption is recorded', cleanState.calendarVersion.$oid !== v1 && cleanState.calendarAdoptions.length === 1);
  check('the adoption is also in the audit history', auditActions(P.clean).some((row) => row.action === 'project.calendar_adopted' && row.details?.toVersion === 2));

  section('CONCURRENCY — a commitment written between the check and the write');
  const raceRun = spawnSync(`${BACKEND_DIR}/node_modules/.bin/tsx`, [`${BACKEND_DIR}/scripts/verify-calendar-guard-race.ts`], {
    cwd: RUN_DIR,
    env: { ...BASE_ENV, PORT: API_PORT, RACE_PROJECT_ID: P.race, RACE_ACTOR_ID: GC.id, RACE_EXTERNAL_ID: E1.id,
      RACE_START: weekday(0).toISOString(), RACE_DUE: weekday(4).toISOString() },
    encoding: 'utf8',
  });
  const raceLines = `${raceRun.stdout}`.split('\n').filter((line) => /^\s+(PASS|FAIL)/.test(line));
  for (const line of raceLines) {
    console.log(line);
    if (/^\s+PASS/.test(line)) passes += 1; else failures += 1;
  }
  if (raceLines.length !== 4) { failures += 1; console.log(`  FAIL  the race leg did not report its four checks  ${raceRun.stderr?.slice(0, 300)}`); }

  section('NOTHING CHANGED SILENTLY');
  for (const key of ['ext', 'int', 'mix', 'formerExt', 'overdue', 'clean', 'prop', 'uiInt']) {
    check(`${key}: task dates, assignees, proposals and memberships are exactly as seeded`, snapshot(P[key]) === before[key]);
  }

  section('FRONTEND — Settings and the project calendar panel (Hebrew)');
  const browser = await chromium.launch();
  const pageErrors = [];
  const openAs = async (person) => {
    const context = await browser.newContext({ viewport: { width: 1360, height: 950 } });
    await context.addInitScript(() => localStorage.setItem('fieldsync-lang', 'he'));
    const page = await context.newPage();
    page.on('pageerror', (error) => pageErrors.push(`${new URL(page.url()).pathname} :: ${error.message}`));
    await page.goto(`${APP}/login`);
    await page.fill('#email', person.email);
    await page.fill('#password', PASSWORD);
    await Promise.all([
      page.waitForResponse((r) => r.url() === `${API}/auth/login` && r.request().method() === 'POST'),
      page.click('form button[type="submit"]'),
    ]);
    await page.waitForURL((url) => url.pathname !== '/login', { timeout: 20000 });
    return page;
  };
  const gcPage = await openAs(GC);
  await gcPage.goto(`${APP}/settings`);
  await gcPage.waitForSelector('[data-testid="company-calendar-version"]', { timeout: 20000 });
  check('Settings shows the company calendar at version 2', (await gcPage.textContent('[data-testid="company-calendar-version"]'))?.includes('גרסה 2') === true);
  check('the editor is offered to a company manager', (await gcPage.locator('#company-calendar-save').count()) === 1);
  check('the limitation note says sector and holidays do not yet affect working days',
    (await gcPage.textContent('[data-testid="company-calendar-limitation"]'))?.includes('אינם משפיעים') === true);
  check('the version history lists both versions', (await gcPage.locator('[data-testid="company-calendar-history"] li').count()) === 2);
  check('the outdated projects are named for the manager', (await gcPage.locator('[data-testid="company-calendar-outdated"] li').count()) === 9);
  await gcPage.fill('#company-calendar-end', '06:00');
  check('an end time before the start shows the error and disables saving',
    (await gcPage.locator('text=שעת הסיום חייבת להיות אחרי שעת ההתחלה').count()) > 0 && (await gcPage.isDisabled('#company-calendar-save')));
  await gcPage.fill('#company-calendar-end', '15:30');
  await gcPage.check('input[name="day-friday"]');
  const [saved] = await Promise.all([
    gcPage.waitForResponse((r) => r.url() === `${API}/calendar/company` && r.request().method() === 'PUT'),
    gcPage.click('#company-calendar-save'),
  ]);
  check('saving from the screen creates version 3', saved.status() === 201);
  await gcPage.waitForSelector('[data-testid="company-calendar-saved"]', { timeout: 10000 });
  check('the screen confirms the new version and the history grows to three',
    (await gcPage.locator('[data-testid="company-calendar-history"] li').count()) === 3);

  await gcPage.goto(`${APP}/projects/${P.ext}`);
  await gcPage.waitForSelector('[data-testid="calendar-lock"]', { timeout: 20000 });
  check('the external project\'s panel explains the lock and offers no adopt button',
    (await gcPage.textContent('[data-testid="calendar-lock"]'))?.includes('בעלי מקצוע חיצוניים') === true && (await gcPage.locator('#calendar-adopt').count()) === 0);
  await gcPage.goto(`${APP}/projects/${P.uiInt}`);
  await gcPage.waitForSelector('[data-testid="calendar-internal-note"]', { timeout: 20000 });
  check('the internal project\'s panel names the employees\' task and keeps the button',
    (await gcPage.textContent('[data-testid="calendar-internal-note"]'))?.includes('1') === true && (await gcPage.locator('#calendar-adopt').count()) === 1);
  const [adopted] = await Promise.all([
    gcPage.waitForResponse((r) => r.url() === `${API}/projects/${P.uiInt}/calendar/adopt`),
    gcPage.click('#calendar-adopt'),
  ]);
  check('adopting from the panel succeeds for internal-only work', adopted.status() === 200, `status=${adopted.status()}`);
  check('…and the pin really moved', projectState(P.uiInt).calendarVersion.$oid !== v1);

  const i2Page = await openAs(I2);
  await i2Page.goto(`${APP}/settings`);
  await i2Page.waitForSelector('[data-testid="company-calendar-readonly"]', { timeout: 20000 });
  check('an employee without company.manage sees the calendar read-only, with no save button',
    (await i2Page.locator('#company-calendar-save').count()) === 0);
  check('…and the outdated count without project names', (await i2Page.locator('[data-testid="company-calendar-outdated"] li').count()) === 0);
  check('no uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
  await browser.close();

  await stopApi();
  const log = readFileSync(BACKEND_LOG, 'utf8');
  check('the API logged no unhandled error', !log.includes('Unhandled error'));
};

runVerification()
  .catch(async (error) => {
    failures += 1;
    console.error('ABORTED:', error instanceof Error ? error.message : error);
  })
  .finally(async () => {
    await stopApi().catch(() => undefined);
    console.log(`\n${passes} PASS, ${failures} FAIL`);
    process.exit(failures === 0 ? 0 : 1);
  });
