/**
 * Standalone date management — the ONE cloud runtime verification, against the DEPLOYED Vercel
 * frontend and Render backend, using only the designated production QA accounts.
 *
 * Fail-closed at every gate:
 *   - Without BLOKTA_VERIFY_CONFIRM=standalone-dates it runs the read-only preflight and stops.
 *   - It targets production only; anything else must be declared REHEARSAL=1, and a rehearsal can
 *     never target production.
 *   - It aborts before its first write unless the new frontend bundle, the new backend and the
 *     original-date migration are all observably live.
 *
 * It creates only its own clearly titled fixtures (one standalone task, one agreement in the
 * existing QA conversation and the task it becomes), consumes no pending QA state, and marks only
 * the notifications it caused as seen. Passwords, tokens and email addresses never reach a log.
 *
 *   node scripts/verify-standalone-dates-cloud.mjs                                   preflight only
 *   BLOKTA_VERIFY_CONFIRM=standalone-dates node scripts/verify-standalone-dates-cloud.mjs
 */
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const PROD_APP = 'https://blokta.vercel.app';
const PROD_API = 'https://blokta.onrender.com/api';
const APP = (process.env.APP_URL ?? PROD_APP).replace(/\/$/, '');
const API = (process.env.API_URL ?? PROD_API).replace(/\/$/, '');
const REHEARSAL = process.env.REHEARSAL === '1';
const WRITE = process.env.BLOKTA_VERIFY_CONFIRM === 'standalone-dates';
const CREDENTIALS =
  process.env.QA_CREDENTIALS ?? join(homedir(), '.blokta-qa', 'credentials', 'qa-accounts.production.json');
const PRODUCTION = APP === PROD_APP && API === PROD_API;

if (PRODUCTION === REHEARSAL) {
  console.error(
    REHEARSAL
      ? 'refused: a rehearsal must never target the production URLs.'
      : 'refused: a non-production target must be declared with REHEARSAL=1.',
  );
  process.exit(2);
}

const started = new Date();
const runId = `sd-${started.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')}`;
const OUT =
  process.env.OUT_DIR ??
  join(homedir(), '.blokta-qa', 'verification', 'standalone-dates', `${REHEARSAL ? 'rehearsal-' : ''}${runId}`);
mkdirSync(join(OUT, 'screens'), { recursive: true, mode: 0o700 });

/* ── sanitized logging ─────────────────────────────────────────────────────────────────────── */

const SECRET = /^(accesstoken|refreshtoken|token|password|confirmpassword|currentpassword|newpassword|credential|authorization|cookie|set-cookie|secret)$/i;
const PERSONAL = /^(email|phone|businessphone|officephone|mobile)$/i;
const maskEmail = (value) => value.replace(/^([^@]{0,10})[^@]*@.*$/, '$1…@…');
const sanitize = (value, key) => {
  if (key !== undefined && SECRET.test(key)) return '[REDACTED]';
  if (key !== undefined && PERSONAL.test(key)) {
    return typeof value === 'string' && value.includes('@') ? maskEmail(value) : '[REDACTED]';
  }
  if (typeof value === 'string') {
    return value
      .replace(/eyJ[\w-]+\.[\w-]+\.[\w-]+/g, '[JWT]')
      .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, (match) => maskEmail(match));
  }
  if (Array.isArray(value)) {
    const head = value.slice(0, 15).map((item) => sanitize(item));
    return value.length > 15 ? [...head, `…+${value.length - 15} more`] : head;
  }
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, sanitize(v, k)]));
  }
  return value;
};

const write = (file, line) => appendFileSync(join(OUT, file), `${line}\n`, { mode: 0o600 });
const say = (line = '') => {
  console.log(line);
  write('run.log', line);
};
let passed = 0;
const failures = [];
const show = (detail) => (typeof detail === 'string' ? detail : JSON.stringify(sanitize(detail)));
const check = (label, ok, detail) => {
  if (ok) passed += 1;
  else failures.push(label);
  say(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${!ok && detail !== undefined ? `  ${show(detail)}` : ''}`);
  return ok;
};
const info = (label, detail) => say(`  INFO  ${label}${detail === undefined ? '' : `  ${show(detail)}`}`);
const section = (title) => say(`\n${title}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const api = async (who, method, path, json, token) => {
  const t0 = Date.now();
  let status = 0;
  let body = null;
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(json === undefined ? {} : { body: JSON.stringify(json) }),
    });
    status = res.status;
    const text = await res.text();
    try {
      body = text.length === 0 ? null : JSON.parse(text);
    } catch {
      body = { raw: text.slice(0, 300) };
    }
  } catch (error) {
    body = { networkError: String(error?.message ?? error) };
  }
  write(
    'http.jsonl',
    JSON.stringify({
      at: new Date().toISOString(),
      who,
      method,
      path,
      status,
      ms: Date.now() - t0,
      request: path.startsWith('/auth/') ? '[auth body redacted]' : sanitize(json),
      response: sanitize(body),
    }),
  );
  return { status, body };
};
const as = (who) => (method, path, json) => api(who.id, method, path, json, who.token);

/* ── run state ─────────────────────────────────────────────────────────────────────────────── */

const now = new Date();
const day = (offset) =>
  new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + offset)).toISOString().slice(0, 10);
const SOLO_TITLE = `אימות מועדים · עבודה עצמאית · ${runId}`;
const BORN_TITLE = `אימות מועדים · עבודה מהסכם · ${runId}`;
const REASON_SOLO = `אימות ענן ${runId}: הלקוח דחה את הכניסה`;
const REASON_BORN = `אימות ענן ${runId}: עיכוב באספקה`;

const fixtures = {};
const markedSeen = [];
const pageErrors = [];
const consoleErrors = [];
const browserHttpErrors = [];
let browser = null;
let aborted = null;

const finish = async () => {
  if (browser !== null) await browser.close().catch(() => {});
  const ended = new Date();
  const summary = {
    runId,
    mode: REHEARSAL ? 'REHEARSAL (local, not cloud)' : 'CLOUD RUNTIME VERIFICATION',
    writes: WRITE ? 'enabled' : 'preflight only — nothing written',
    target: { app: APP, api: API },
    window: { startUtc: started.toISOString(), endUtc: ended.toISOString() },
    passed,
    failed: failures.length,
    failures,
    aborted,
    fixtures,
    notificationsMarkedSeen: markedSeen,
    browser: { pageErrors: pageErrors.length, consoleErrors: consoleErrors.length, httpErrors: browserHttpErrors.length },
    files: {
      runLog: join(OUT, 'run.log'),
      http: join(OUT, 'http.jsonl'),
      browser: join(OUT, 'browser.jsonl'),
      screens: join(OUT, 'screens'),
    },
  };
  writeFileSync(join(OUT, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`, { mode: 0o600 });
  say(`\n${aborted ? `ABORTED: ${aborted}\n` : ''}${passed} passed, ${failures.length} failed.`);
  say(`Window (UTC): ${summary.window.startUtc} → ${summary.window.endUtc}`);
  say(`Logs: ${OUT}`);
  process.exit(aborted || failures.length > 0 ? 1 : 0);
};
const abort = async (reason) => {
  aborted = reason;
  await finish();
};

const listAll = async (call, path, key) => {
  const rows = [];
  let cursor = null;
  for (let page = 0; page < 10; page += 1) {
    const joiner = path.includes('?') ? '&' : '?';
    const res = await call('GET', `${path}${cursor ? `${joiner}cursor=${encodeURIComponent(cursor)}` : ''}`);
    if (res.status !== 200) return null;
    rows.push(...(res.body?.[key] ?? []));
    cursor = res.body?.nextCursor ?? null;
    if (cursor === null) break;
  }
  return rows;
};

/* ── the browser ───────────────────────────────────────────────────────────────────────────── */

const watch = (page, who) => {
  page.on('pageerror', (error) => {
    pageErrors.push(String(error.message));
    write('browser.jsonl', JSON.stringify({ at: new Date().toISOString(), who, kind: 'pageerror', text: sanitize(String(error.message)) }));
  });
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const text = sanitize(message.text());
    const source = message.location()?.url ?? '';
    const external = /accounts\.google\.com|gstatic\.com/.test(source) || /GSI_LOGGER/.test(text);
    if (!external) consoleErrors.push(text);
    write('browser.jsonl', JSON.stringify({ at: new Date().toISOString(), who, kind: 'console.error', external, text, source: sanitize(source) }));
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (response.status() < 400 || url.origin !== new URL(API).origin) return;
    const expected = response.status() === 401 && url.pathname.endsWith('/auth/refresh');
    if (!expected) browserHttpErrors.push(`${response.request().method()} ${url.pathname} ${response.status()}`);
    write('browser.jsonl', JSON.stringify({ at: new Date().toISOString(), who, kind: 'http', expected, method: response.request().method(), path: url.pathname, status: response.status() }));
  });
  page.on('requestfailed', (request) => {
    write('browser.jsonl', JSON.stringify({ at: new Date().toISOString(), who, kind: 'requestfailed', path: sanitize(new URL(request.url()).pathname), failure: request.failure()?.errorText ?? null }));
  });
};

let shot = 0;
const screenshot = async (page, name) => {
  shot += 1;
  const file = join(OUT, 'screens', `${String(shot).padStart(2, '0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true }).catch(() => {});
};

const uiLogin = async (account) => {
  const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
  const page = await context.newPage();
  watch(page, account.id);
  await page.goto(`${APP}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('#email', account.email);
  await page.fill('#password', account.password);
  await Promise.all([
    page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 60000 }),
    page.click('button[type="submit"]'),
  ]);
  return page;
};

const editDatesInUi = async (page, taskId, dates) => {
  const panel = page.locator('section[aria-labelledby="standalone-dates-title"]');
  await panel.locator('a[href$="/edit"]').click();
  await page.waitForSelector('#edit-start', { timeout: 30000 });
  if (dates.start !== undefined) await page.fill('#edit-start', dates.start);
  if (dates.due !== undefined) await page.fill('#edit-due', dates.due);
  await page.fill('#edit-date-reason', dates.reason);
  const [response] = await Promise.all([
    page.waitForResponse(
      (r) => r.request().method() === 'PATCH' && new URL(r.url()).pathname.endsWith(`/tasks/${taskId}`),
      { timeout: 60000 },
    ),
    page.click('.settings-actions .btn--primary'),
  ]);
  return response.status();
};

const openPanelAfterRefresh = async (page, taskId) => {
  await page.goto(`${APP}/tasks/${taskId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#standalone-dates-title', { timeout: 45000 });
  return page.locator('section[aria-labelledby="standalone-dates-title"]');
};

/* ── the procedure ─────────────────────────────────────────────────────────────────────────── */

const run = async () => {
  say(`BLOKTA standalone date management — ${REHEARSAL ? 'LOCAL REHEARSAL (not cloud verification)' : 'CLOUD RUNTIME VERIFICATION'}`);
  say(`run ${runId} · app ${APP} · api ${API} · ${WRITE ? 'writes ENABLED' : 'PREFLIGHT ONLY'}`);

  const credentials = JSON.parse(readFileSync(CREDENTIALS, 'utf8'));
  const account = (id) => {
    const found = credentials.accounts.find((row) => row.id === id);
    if (found === undefined) throw new Error(`QA account ${id} is not in the credentials file.`);
    return found;
  };

  section('0. Preflight — read-only');
  let health = null;
  for (let attempt = 0; attempt < 8 && health === null; attempt += 1) {
    const res = await api('anonymous', 'GET', '/health');
    if (res.status === 200) health = res.body;
    else await sleep(15000);
  }
  check('the backend answers /health', health?.status === 'ok', health);
  check('and reports its database connected', health?.database === 'connected', health);
  if (health?.status !== 'ok') return abort('backend unreachable');

  const shell = await fetch(`${APP}/`);
  const html = await shell.text();
  check('the frontend serves the application shell', shell.status === 200 && html.includes('id="root"'), shell.status);
  const scripts = [...html.matchAll(/\/assets\/[\w.-]+\.js/g)].map((match) => match[0]);
  const seen = new Set();
  const queue = [...scripts];
  let bundleText = '';
  while (queue.length > 0 && seen.size < 80) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    const text = await (await fetch(`${APP}${path}`)).text();
    bundleText += text;
    if (bundleText.includes('ניהול מועדים') && bundleText.includes('מועד הבסיס') && bundleText.includes(new URL(API).host)) break;
    for (const match of text.matchAll(/assets\/[\w.-]+\.js/g)) queue.push(`/${match[0]}`);
  }
  const frontendLive = bundleText.includes('ניהול מועדים') && bundleText.includes('מועד הבסיס');
  check('the deployed frontend bundle carries the new date-management copy', frontendLive, `${seen.size} chunk(s) scanned`);
  check('and it is built against this backend', bundleText.includes(new URL(API).host), new URL(API).host);
  if (!frontendLive) return abort('the new frontend is not deployed — nothing was written');

  const login = async (id) => {
    const qa = account(id);
    const res = await api(id, 'POST', '/auth/login', { email: qa.email, password: qa.password });
    if (res.status !== 200 || typeof res.body?.accessToken !== 'string') return null;
    return { id, token: res.body.accessToken, userId: res.body.user?.id };
  };
  const performer = await login('QA-03');
  const commissioner = await login('QA-02');
  const outsider = await login('QA-08');
  check('QA-03 (performer) signs in through the API', performer !== null);
  check('QA-02 (commissioner) signs in through the API', commissioner !== null);
  check('QA-08 (outsider) signs in through the API', outsider !== null);
  if (!performer || !commissioner || !outsider) return abort('a QA account could not sign in');
  const asPerformer = as(performer);
  const asCommissioner = as(commissioner);
  const asOutsider = as(outsider);

  const before = await listAll(asPerformer, '/tasks?limit=50', 'tasks');
  check('the performer’s task queue reads', Array.isArray(before) && before.length > 0, before?.length);
  if (!before || before.length === 0) return abort('no performer tasks to probe');

  const details = new Map();
  for (const row of before) {
    const res = await asPerformer('GET', `/tasks/${row.id}`);
    if (res.status === 200) details.set(row.id, res.body.task);
  }
  const sample = details.values().next().value;
  const backendLive = sample !== undefined && 'originalDatesSource' in sample && Array.isArray(sample.dateChanges);
  check('the deployed backend serves the new task-detail fields', backendLive);
  if (!backendLive) return abort('the new backend is not deployed — nothing was written');

  const legacyUnmigrated = [...details.values()].filter(
    (task) => task.kind === 'standalone' && task.originalDatesSource === null,
  );
  check('the original-date migration has been applied (no standalone task without a source)', legacyUnmigrated.length === 0, legacyUnmigrated.map((task) => task.id));
  if (legacyUnmigrated.length > 0) return abort('the migration is not applied — nothing was written');

  const inbox = await listAll(asPerformer, '/conversations?folder=inbox&limit=50', 'conversations');
  const conversation = (inbox ?? []).find(
    (row) => row.kind === 'direct' && row.counterpartyId === commissioner.userId,
  );
  check('the existing QA-02 ↔ QA-03 conversation is found', conversation !== undefined);
  if (conversation === undefined) return abort('no accepted conversation between the commissioner and the performer');
  fixtures.conversationId = conversation.id;

  if (!WRITE) {
    say('\nPREFLIGHT ONLY — set BLOKTA_VERIFY_CONFIRM=standalone-dates to run the write legs. Nothing was written.');
    return finish();
  }

  section('1. Original-date classification on the pre-existing QA tasks — read-only');
  const messages = await listAll(asPerformer, `/conversations/${conversation.id}/messages?limit=50`, 'messages');
  const agreed = new Map(
    (messages ?? [])
      .filter((message) => message.agreement?.taskId)
      .map((message) => [message.agreement.taskId, message.agreement]),
  );
  const tally = { agreement: 0, migration_baseline: 0, creation: 0, none: 0 };
  for (const task of details.values()) {
    const source = task.originalDatesSource;
    tally[source ?? 'none'] += 1;
    if (task.kind === 'project') {
      check(`project ${task.id}: source ${source ?? 'none'}, no standalone trail`, (source === null || source === 'creation') && task.dateChanges.length === 0, task);
    } else if (task.fromAgreement) {
      const deal = agreed.get(task.id);
      const matches = source !== 'agreement' || (deal !== undefined && deal.startDate === task.originalStartDate && deal.dueDate === task.originalDueDate);
      check(`agreement-born ${task.id}: source ${source}${source === 'agreement' ? ', originals equal the agreement message' : ''}`, (source === 'agreement' || source === 'creation') && matches, { source, originals: [task.originalStartDate, task.originalDueDate], agreement: deal ? [deal.startDate, deal.dueDate] : null });
    } else {
      const baselineHolds = source !== 'migration_baseline' || task.dateChanges.length > 0 || (task.originalStartDate === task.startDate && task.originalDueDate === task.dueDate);
      check(`self-created ${task.id}: source ${source}${source === 'migration_baseline' ? ', baseline equals the dates on record' : ''}`, (source === 'migration_baseline' || source === 'creation') && baselineHolds, task);
    }
  }
  info('classification tally', tally);
  check('an agreement-recovered original is observable', tally.agreement > 0, tally);
  check('a migration baseline is observable', tally.migration_baseline > 0, tally);

  const unread = async (call) => (await call('GET', '/notifications?limit=1')).body?.unreadCount ?? null;
  const unreadBefore = {
    performer: await unread(asPerformer),
    commissioner: await unread(asCommissioner),
    outsider: await unread(asOutsider),
  };
  info('unread notifications before', unreadBefore);
  const commissionedBefore = (await asCommissioner('GET', '/tasks/commissioned')).body?.commissioned ?? [];
  const pendingProposalId = credentials.fixtures?.['proposal.pending'];
  const proposalBefore = pendingProposalId
    ? (await asCommissioner('GET', `/coordination/proposals/${pendingProposalId}`)).body?.proposal?.status ?? null
    : null;
  if (pendingProposalId) info('the pending QA proposal (read-only)', proposalBefore);

  section('2. Project-linked scheduling is unchanged — read-only plus one refused write');
  const projectRow = before.find(
    (row) => row.kind === 'project' && row.state !== 'completed' && !row.orphaned && !row.viewerIsDelegate && !row.delegated,
  );
  check('a live project task of the performer is available to probe', projectRow !== undefined);
  if (projectRow !== undefined) {
    const projectTask = details.get(projectRow.id);
    check('it still shows its project stage', projectTask?.stage !== null, projectTask?.stage);
    check('it still offers the project date-change flow', projectTask?.viewer?.canRequestDateChange === true);
    const refused = await asPerformer('PATCH', `/tasks/${projectRow.id}`, { startDate: day(200), dueDate: day(201) });
    check('a direct date edit on it is refused (409)', refused.status === 409, refused.status);
    check('naming the proposal flow', refused.body?.code === 'TASK_EDIT_DATES_NEED_PROPOSAL', refused.body?.code);
    const preview = await asPerformer('POST', `/tasks/${projectRow.id}/date-change/preview`, { deltaWorkingDays: 1 });
    check('the read-only impact preview still computes (200)', preview.status === 200 && preview.body?.preview !== undefined, preview.status);
    const after = (await asPerformer('GET', `/tasks/${projectRow.id}`)).body?.task;
    check('and its dates did not move', after?.startDate === projectTask?.startDate && after?.dueDate === projectTask?.dueDate);
  }

  section('3. A self-created standalone task, through the deployed UI');
  const created = await asPerformer('POST', '/tasks', { kind: 'standalone', title: SOLO_TITLE, startDate: day(40), dueDate: day(44) });
  check('the performer opens a fresh standalone task (201)', created.status === 201, created.status);
  const soloId = created.body?.task?.id;
  if (!soloId) return abort('the standalone fixture could not be created');
  fixtures.soloTaskId = soloId;
  fixtures.soloTitle = SOLO_TITLE;

  browser = await chromium.launch();
  const performerPage = await uiLogin(account('QA-03'));
  check('QA-03 signs in through the deployed login screen', !new URL(performerPage.url()).pathname.startsWith('/login'));

  await performerPage.goto(`${APP}/tasks/${soloId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await performerPage.waitForSelector('#standalone-dates-title', { timeout: 45000 }).catch(() => {});
  const soloPanel = performerPage.locator('section[aria-labelledby="standalone-dates-title"]');
  check('the standalone date-management panel is drawn', (await soloPanel.count()) === 1);
  check('no project stage section is drawn', (await performerPage.locator('#stage-title').count()) === 0);
  check('no project date-change panel is drawn', (await performerPage.locator('#date-change-title').count()) === 0);
  const soloPanelText = (await soloPanel.textContent()) ?? '';
  check('the originals are labelled as originally agreed', /המועד שסוכם במקור|Originally agreed/.test(soloPanelText));
  check('the history starts empty', /המועדים טרם שונו|have not changed yet/.test(soloPanelText));
  await screenshot(performerPage, 'solo-before');

  const soloSave = await editDatesInUi(performerPage, soloId, { start: day(43), due: day(49), reason: REASON_SOLO });
  check('saving new planned dates in Edit Task succeeds (PATCH 200)', soloSave === 200, soloSave);
  await screenshot(performerPage, 'solo-saved');

  const soloAfterPanel = await openPanelAfterRefresh(performerPage, soloId);
  const soloRows = soloAfterPanel.locator('.dash-history__row');
  check('after a refresh the history shows exactly one change', (await soloRows.count()) === 1, await soloRows.count());
  check('carrying the reason that was entered', ((await soloRows.first().textContent()) ?? '').includes(REASON_SOLO));
  await screenshot(performerPage, 'solo-after-refresh');

  const solo = (await asPerformer('GET', `/tasks/${soloId}`)).body?.task;
  check('the planned dates persisted server-side', solo?.startDate === day(43) && solo?.dueDate === day(49), [solo?.startDate, solo?.dueDate]);
  check('the originals stayed at the first planned dates', solo?.originalStartDate === day(40) && solo?.originalDueDate === day(44));
  check('classified as a creation stamp', solo?.originalDatesSource === 'creation', solo?.originalDatesSource);
  check(
    'the trail records from, to and the reason',
    solo?.dateChanges?.length === 1 && solo.dateChanges[0].fromDueDate === day(44) && solo.dateChanges[0].toDueDate === day(49) && solo.dateChanges[0].reason === REASON_SOLO,
    solo?.dateChanges,
  );

  section('4. An agreement-born standalone task, and the commissioner’s informational notice');
  const proposed = await asCommissioner('POST', `/conversations/${conversation.id}/agreements`, { title: BORN_TITLE, startDate: day(60), dueDate: day(66) });
  check('the commissioner proposes a fresh agreement in the existing QA conversation (201)', proposed.status === 201, proposed.status);
  const agreementId = proposed.body?.message?.id;
  if (!agreementId) return abort('the agreement fixture could not be proposed');
  fixtures.agreementMessageId = agreementId;
  const accepted = await asPerformer('POST', `/conversations/${conversation.id}/agreements/${agreementId}/accept`);
  check('the performer accepts it (200)', accepted.status === 200, accepted.status);
  const bornId = accepted.body?.message?.agreement?.taskId;
  if (!bornId) return abort('the agreement did not produce a task');
  fixtures.bornTaskId = bornId;
  fixtures.bornTitle = BORN_TITLE;

  const born = (await asPerformer('GET', `/tasks/${bornId}`)).body?.task;
  check('the task knows it was born from an agreement', born?.fromAgreement === true);
  check('its counterparty is the commissioner, resolved from the agreement message', born?.counterparty?.userId === commissioner.userId);
  check('its originals are the agreed dates', born?.originalStartDate === day(60) && born?.originalDueDate === day(66));
  check('no project date-change flow is offered on it', born?.viewer?.canRequestDateChange === false);

  const byCommissioner = await asCommissioner('PATCH', `/tasks/${bornId}`, { dueDate: day(90) });
  check('the commissioner cannot edit the performer’s dates (403)', byCommissioner.status === 403, byCommissioner.status);
  const byOutsider = await asOutsider('GET', `/tasks/${bornId}`);
  check('the outsider cannot read the task (404)', byOutsider.status === 404, byOutsider.status);

  await performerPage.goto(`${APP}/tasks/${bornId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await performerPage.waitForSelector('#standalone-dates-title', { timeout: 45000 }).catch(() => {});
  const bornPanelText = (await performerPage.locator('section[aria-labelledby="standalone-dates-title"]').textContent()) ?? '';
  check('the panel says the work was born from an agreement', /העבודה נולדה מהסכם|born from an agreement/.test(bornPanelText));
  await screenshot(performerPage, 'born-before');

  const bornSave = await editDatesInUi(performerPage, bornId, { due: day(70), reason: REASON_BORN });
  check('recording the execution delay in Edit Task succeeds (PATCH 200)', bornSave === 200, bornSave);
  const bornAfterPanel = await openPanelAfterRefresh(performerPage, bornId);
  const bornRows = bornAfterPanel.locator('.dash-history__row');
  check('after a refresh its history shows the delay', (await bornRows.count()) === 1 && ((await bornRows.first().textContent()) ?? '').includes(REASON_BORN));
  await screenshot(performerPage, 'born-after-refresh');

  const bornAfter = (await asPerformer('GET', `/tasks/${bornId}`)).body?.task;
  check('the delay persisted server-side', bornAfter?.startDate === day(60) && bornAfter?.dueDate === day(70));
  check('the agreed originals are untouched', bornAfter?.originalStartDate === day(60) && bornAfter?.originalDueDate === day(66));

  const thread = await listAll(asCommissioner, `/conversations/${conversation.id}/messages?limit=50`, 'messages');
  const deal = (thread ?? []).find((message) => message.id === agreementId)?.agreement;
  check('the agreement message itself was not rewritten', deal?.startDate === day(60) && deal?.dueDate === day(66) && deal?.state === 'accepted', deal);

  const feed = async (call) => (await listAll(call, '/notifications?limit=50', 'notifications')) ?? [];
  const ours = (rows, type) => rows.filter((row) => (row.taskId === soloId || row.taskId === bornId) && (type === undefined || row.type === type));
  const commissionerFeed = await feed(asCommissioner);
  const notices = ours(commissionerFeed, 'task.updated').filter((row) => row.taskId === bornId);
  check('the commissioner received exactly one informational notice', notices.length === 1, notices.length);
  check('it is unread and carries the task title', notices[0]?.seenAt === null && notices[0]?.payload?.taskTitle === BORN_TITLE, notices[0]);
  check('the self-created task told the commissioner nothing', ours(commissionerFeed).filter((row) => row.taskId === soloId).length === 0);
  check('the performer was not notified about their own changes', ours(await feed(asPerformer), 'task.updated').length === 0);
  check('the outsider received nothing about either task', ours(await feed(asOutsider)).length === 0);
  check('the outsider’s unread count did not move', (await unread(asOutsider)) === unreadBefore.outsider);

  const commissioned = (await asCommissioner('GET', '/tasks/commissioned')).body?.commissioned ?? [];
  const tracked = commissioned.find((row) => row.id === bornId);
  check('the commissioner’s commissioned-work list shows the new due date', tracked?.dueDate === day(70), tracked);

  const commissionerPage = await uiLogin(account('QA-02'));
  check('QA-02 signs in through the deployed login screen', !new URL(commissionerPage.url()).pathname.startsWith('/login'));
  await commissionerPage.goto(`${APP}/notifications`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await commissionerPage.waitForSelector('.notif-row', { timeout: 45000 }).catch(() => {});
  const row = commissionerPage.locator('.notif-row', { hasText: BORN_TITLE });
  check('the notice appears in the commissioner’s notification centre', (await row.count()) === 1, await row.count());
  await screenshot(commissionerPage, 'commissioner-notifications');
  const link = row.locator('.notif-row__actions a');
  if ((await link.count()) === 0) {
    check('the notice is informational and offers no dead link', true);
  } else {
    await link.first().click();
    await commissionerPage.waitForLoadState('domcontentloaded');
    await sleep(2500);
    const landed = (await commissionerPage.locator('main').textContent()) ?? '';
    await screenshot(commissionerPage, 'commissioner-notice-destination');
    check(
      'following the notice lands where the commissioner can see the new date',
      landed.includes(BORN_TITLE) && landed.includes(day(70)),
      { landedOn: new URL(commissionerPage.url()).pathname },
    );
  }

  section('5. Nothing unrelated moved');
  const afterRows = (await listAll(asPerformer, '/tasks?limit=50', 'tasks')) ?? [];
  const afterById = new Map(afterRows.map((row) => [row.id, row]));
  const moved = before.filter((row) => {
    const now2 = afterById.get(row.id);
    return now2 === undefined || now2.startDate !== row.startDate || now2.dueDate !== row.dueDate || now2.state !== row.state || now2.pendingProposal !== row.pendingProposal;
  });
  check('every pre-existing performer task kept its dates, state and proposal marker', moved.length === 0, moved.map((row) => row.id));
  const commissionedAfter = new Map(commissioned.map((row) => [row.id, row]));
  const shifted = commissionedBefore.filter((row) => commissionedAfter.get(row.id)?.dueDate !== row.dueDate);
  check('every pre-existing commissioned task kept its due date', shifted.length === 0, shifted.map((row) => row.id));
  if (pendingProposalId) {
    const proposalAfter = (await asCommissioner('GET', `/coordination/proposals/${pendingProposalId}`)).body?.proposal?.status ?? null;
    check('the pending QA date-change proposal is untouched', proposalAfter === proposalBefore, [proposalBefore, proposalAfter]);
  }

  section('6. The deployed frontend stayed healthy');
  check('no uncaught page errors', pageErrors.length === 0, pageErrors);
  check('no application console errors', consoleErrors.length === 0, consoleErrors);
  check('no unexpected failed API responses in the browser', browserHttpErrors.length === 0, browserHttpErrors);

  section('7. Restoring the QA notification baseline');
  for (const [label, call] of [['commissioner', asCommissioner], ['performer', asPerformer]]) {
    const rows = (await feed(call)).filter(
      (row) =>
        row.seenAt === null &&
        new Date(row.createdAt) >= started &&
        (row.taskId === soloId || row.taskId === bornId || row.conversationId === conversation.id),
    );
    if (rows.length > 0) {
      const res = await call('POST', '/notifications/seen', { ids: rows.map((row) => row.id) });
      check(`the ${label}’s ${rows.length} run-created notification(s) marked seen`, res.status < 300, res.status);
      markedSeen.push(...rows.map((row) => ({ account: label, id: row.id, type: row.type })));
    }
  }
  const unreadAfter = { performer: await unread(asPerformer), commissioner: await unread(asCommissioner), outsider: await unread(asOutsider) };
  info('unread notifications after', unreadAfter);
  check('unread counts are back to their pre-run values', JSON.stringify(unreadAfter) === JSON.stringify(unreadBefore), { before: unreadBefore, after: unreadAfter });

  return finish();
};

run().catch(async (error) => {
  say(`\nERROR: ${sanitize(String(error?.stack ?? error))}`);
  await abort('the procedure threw — see the error above');
});
