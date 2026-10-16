/**
 * Deployment compatibility: the NEW frontend against the PREVIOUS backend, the state production is
 * in while Vercel has finished deploying and Render has not. Rehearsal only — it creates a task, so
 * it refuses the production URLs outright.
 *
 *   APP_URL=<new frontend built against the previous API> API_URL=<previous API> \
 *   QA_CREDENTIALS=<rehearsal credentials> node scripts/verify-previous-backend-compat.mjs
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const APP = (process.env.APP_URL ?? '').replace(/\/$/, '');
const API = (process.env.API_URL ?? '').replace(/\/$/, '');
if (!APP || !API || /blokta\.(vercel\.app|onrender\.com)/.test(`${APP} ${API}`)) {
  console.error('refused: give APP_URL and API_URL for a local rehearsal; production URLs are never accepted.');
  process.exit(2);
}

const runId = `compat-${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`;
const OUT = process.env.OUT_DIR ?? join(homedir(), '.blokta-qa', 'verification', 'standalone-dates', runId);
mkdirSync(join(OUT, 'screens'), { recursive: true, mode: 0o700 });
const write = (file, line) => appendFileSync(join(OUT, file), `${line}\n`, { mode: 0o600 });
const say = (line = '') => {
  console.log(line);
  write('run.log', line);
};
const scrub = (text) =>
  String(text).replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[JWT]').replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]');
let passed = 0;
const failures = [];
const check = (label, ok, detail) => {
  if (ok) passed += 1;
  else failures.push(label);
  say(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  ${scrub(JSON.stringify(detail))}` : ''}`);
};

const api = async (method, path, json, token) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
  const text = await res.text();
  write('http.jsonl', JSON.stringify({ at: new Date().toISOString(), method, path, status: res.status }));
  return { status: res.status, body: text ? JSON.parse(text) : null };
};

const credentials = JSON.parse(readFileSync(process.env.QA_CREDENTIALS ?? '', 'utf8'));
const performer = credentials.accounts.find((row) => row.id === 'QA-03');
const pageErrors = [];
const consoleErrors = [];
const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

say(`Compatibility rehearsal ${runId}: new frontend ${APP} against previous backend ${API}`);

const login = await api('POST', '/auth/login', { email: performer.email, password: performer.password });
check('the performer signs in against the previous backend', login.status === 200);
const token = login.body?.accessToken;
const created = await api('POST', '/tasks', { kind: 'standalone', title: 'תאימות לאחור', startDate: day(20), dueDate: day(24) }, token);
check('the previous backend opens a standalone task', created.status === 201, created.status);
const taskId = created.body?.task?.id;
const previous = (await api('GET', `/tasks/${taskId}`, undefined, token)).body?.task ?? {};
check(
  'the previous backend really serves the previous shape (no trail, no originals)',
  !('dateChanges' in previous) && !('originalDatesSource' in previous) && !('originalStartDate' in previous),
  Object.keys(previous),
);

const browser = await chromium.launch();
const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
page.on('pageerror', (error) => {
  pageErrors.push(scrub(error.message));
  write('browser.jsonl', JSON.stringify({ kind: 'pageerror', text: scrub(error.message) }));
});
page.on('console', (message) => {
  if (message.type() !== 'error') return;
  consoleErrors.push(scrub(message.text()));
  write('browser.jsonl', JSON.stringify({ kind: 'console.error', text: scrub(message.text()) }));
});

await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded' });
await page.fill('#email', performer.email);
await page.fill('#password', performer.password);
await Promise.all([page.waitForURL((url) => !url.pathname.startsWith('/login')), page.click('button[type="submit"]')]);

const openTask = async (refresh = false) => {
  await page.goto(`${APP}/tasks/${taskId}`, { waitUntil: 'domcontentloaded' });
  if (refresh) await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#task-summary-title', { timeout: 30000 }).catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 1500));
};

await openTask();
check('the standalone task page renders — no crash into the error boundary', (await page.locator('.app-error').count()) === 0);
const panel = page.locator('section[aria-labelledby="standalone-dates-title"]');
check('the date-management panel renders against the previous response', (await panel.count()) === 1);
const text = (await panel.textContent()) ?? '';
check('missing originals read as "not recorded", never a guess', /לא תועד במערכת|Not recorded/.test(text));
check('a missing trail reads as an empty history', /המועדים טרם שונו|have not changed yet/.test(text));
await page.screenshot({ path: join(OUT, 'screens', '01-task-previous-backend.png'), fullPage: true });

const legacy = await api('POST', `/tasks/${taskId}/private`, { kind: 'subtask', body: 'תת-משימה ותיקה' }, token);
check('the previous backend stores a private sub-task', legacy.status === 201, legacy.status);
await openTask();
const legacyRow = page.locator('.private-item', { hasText: 'תת-משימה ותיקה' });
check('without the new flag the page still loads the owner’s private layer', (await legacyRow.count()) === 1);
check('the sub-task renders as not started from the previous shape', (await legacyRow.locator('.task-chip--not_started').count()) === 1);
await legacyRow.getByRole('button', { name: /התחלת ביצוע|^Start$/ }).click();
await new Promise((resolve) => setTimeout(resolve, 1500));
check('starting it before the backend is updated fails softly — no crash', (await page.locator('.app-error').count()) === 0);

await panel.locator('a[href$="/edit"]').click();
await page.waitForSelector('#edit-start', { timeout: 30000 });
await page.fill('#edit-due', day(27));
await page.fill('#edit-date-reason', 'בדיקת תאימות');
const [patch] = await Promise.all([
  page.waitForResponse((r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname.endsWith(`/tasks/${taskId}`)),
  page.click('.settings-actions .btn--primary'),
]);
check('saving dates with a reason still succeeds — the previous backend ignores the unknown field', patch.status() === 200, patch.status());

await openTask(true);
check('after a refresh the page still renders', (await page.locator('.app-error').count()) === 0 && (await panel.count()) === 1);
const after = (await api('GET', `/tasks/${taskId}`, undefined, token)).body?.task;
check('the date change reached the previous backend', after?.dueDate === day(27), after?.dueDate);

await page.goto(`${APP}/tasks?commissioned=${taskId}`, { waitUntil: 'domcontentloaded' });
await new Promise((resolve) => setTimeout(resolve, 1500));
check('My Tasks with a commissioned focus renders', (await page.locator('.app-error').count()) === 0);
await page.goto(`${APP}/notifications`, { waitUntil: 'domcontentloaded' });
await new Promise((resolve) => setTimeout(resolve, 1500));
check('the notification centre renders', (await page.locator('.app-error').count()) === 0);

check('no uncaught page errors anywhere', pageErrors.length === 0, pageErrors);
check(
  'no console errors other than the expected refusal of the not-yet-deployed start route',
  consoleErrors.every((text) => /status of 404/.test(text)) && consoleErrors.length <= 1,
  consoleErrors,
);

await browser.close();
writeFileSync(join(OUT, 'summary.json'), `${JSON.stringify({ runId, app: APP, api: API, passed, failed: failures.length, failures }, null, 2)}\n`, { mode: 0o600 });
say(`\n${passed} passed, ${failures.length} failed.\nLogs: ${OUT}`);
process.exit(failures.length === 0 ? 0 : 1);
