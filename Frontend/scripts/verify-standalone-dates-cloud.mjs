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
 * existing QA conversation and the task it becomes, and private sub-tasks on its own standalone
 * task only), consumes no pending QA state, reads the existing delegated QA task without changing
 * it, and marks only the notifications it caused as seen. Passwords, tokens and email addresses
 * never reach a log.
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
const browserRequests = [];

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
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (url.origin === new URL(API).origin) browserRequests.push({ who, method: request.method(), path: url.pathname });
  });
  page.on('response', (response) => {
    const url = new URL(response.url());
    if (response.status() < 400 || url.origin !== new URL(API).origin) return;
    const expected = response.status() === 401 && url.pathname.endsWith('/auth/refresh');
    if (!expected) browserHttpErrors.push(`${who} ${response.request().method()} ${url.pathname} ${response.status()}`);
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

const openTask = async (page, taskId, refresh = false) => {
  await page.goto(`${APP}/tasks/${taskId}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  if (refresh) await page.reload({ waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForSelector('#task-summary-title', { timeout: 45000 }).catch(() => {});
  await sleep(1500);
};

const has = async (page, selector) => (await page.locator(selector).count()) > 0;

/** The delegation panel is drawn only for a delegate, the delegator of an active delegation, or someone who may delegate now. */
const checkDelegationPanel = async (page, task, where) => {
  const expected = task.viewerIsDelegate || task.delegation !== null || task.viewer.canDelegate;
  const present = await has(page, '#delegation-title');
  check(`${where}: the delegation panel is ${expected ? 'shown' : 'absent'} as the viewer’s standing requires`, present === expected, { expected, present });
  if (present) {
    const controls = await has(page, 'section[aria-labelledby="delegation-title"] .btn--primary');
    const controlsExpected = task.viewer.canDelegate && !task.viewerIsDelegate && task.delegation === null;
    check(`${where}: delegation controls appear only when the viewer may delegate`, controls === controlsExpected, { controls, controlsExpected });
  }
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

/* ── the procedure ─────────────────────────────────────────────────────────────────────────── */

const run = async () => {
  say(`BLOKTA standalone date management — ${REHEARSAL ? 'LOCAL REHEARSAL (not cloud verification)' : 'CLOUD RUNTIME VERIFICATION'}`);
  say(`run ${runId} · app ${APP} · api ${API} · ${WRITE ? 'writes ENABLED' : 'PREFLIGHT ONLY'}`);

  const credentials = JSON.parse(readFileSync(CREDENTIALS, 'utf8'));
  const account = (id) => credentials.accounts.find((row) => row.id === id);

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
  const queue = [...html.matchAll(/\/assets\/[\w.-]+\.js/g)].map((match) => match[0]);
  const seen = new Set();
  let bundleText = '';
  const apiHost = new URL(API).host;
  while (queue.length > 0 && seen.size < 80) {
    const path = queue.shift();
    if (seen.has(path)) continue;
    seen.add(path);
    const text = await (await fetch(`${APP}${path}`)).text();
    bundleText += text;
    if (bundleText.includes('ניהול מועדים') && bundleText.includes('מועד הבסיס') && bundleText.includes(apiHost)) break;
    for (const match of text.matchAll(/assets\/[\w.-]+\.js/g)) queue.push(`/${match[0]}`);
  }
  const frontendLive = bundleText.includes('ניהול מועדים') && bundleText.includes('מועד הבסיס');
  check('the deployed frontend bundle carries the new date-management copy', frontendLive, `${seen.size} chunk(s) scanned`);
  check('and it is built against this backend', bundleText.includes(apiHost), apiHost);
  if (!frontendLive) return abort('the new frontend is not deployed — nothing was written');

  const login = async (id) => {
    const qa = account(id);
    if (qa === undefined) return null;
    const res = await api(id, 'POST', '/auth/login', { email: qa.email, password: qa.password });
    if (res.status !== 200 || typeof res.body?.accessToken !== 'string') return null;
    return { id, token: res.body.accessToken, userId: res.body.user?.id };
  };
  const performer = await login('QA-03');
  const commissioner = await login('QA-02');
  const outsider = await login('QA-08');
  const delegate = await login('QA-04');
  check('QA-03 (performer) signs in through the API', performer !== null);
  check('QA-02 (commissioner, project GC) signs in through the API', commissioner !== null);
  check('QA-08 (outsider) signs in through the API', outsider !== null);
  if (delegate === null) info('QA-04 (delegate) unavailable — the delegate view is skipped');
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

  browser = await chromium.launch();
  const performerPage = await uiLogin(account('QA-03'));
  check('QA-03 signs in through the deployed login screen', !new URL(performerPage.url()).pathname.startsWith('/login'));
  const commissionerPage = await uiLogin(account('QA-02'));
  check('QA-02 signs in through the deployed login screen', !new URL(commissionerPage.url()).pathname.startsWith('/login'));

  section('2. Project-linked scheduling and panels are unchanged — read-only plus one refused write');
  const projectRow = before.find(
    (row) => row.kind === 'project' && row.state !== 'completed' && !row.orphaned && !row.viewerIsDelegate && !row.delegated,
  );
  check('a live project task of the performer is available to probe', projectRow !== undefined);
  if (projectRow !== undefined) {
    const projectTask = details.get(projectRow.id);
    check('it still shows its project stage', projectTask?.stage !== null, projectTask?.stage);
    check('it still offers the project date-change flow', projectTask?.viewer?.canRequestDateChange === true);
    check('the performer is told they have a private layer on it', projectTask?.viewer?.hasPrivateLayer === true);
    const refused = await asPerformer('PATCH', `/tasks/${projectRow.id}`, { startDate: day(200), dueDate: day(201) });
    check('a direct date edit on it is refused (409)', refused.status === 409, refused.status);
    check('naming the proposal flow', refused.body?.code === 'TASK_EDIT_DATES_NEED_PROPOSAL', refused.body?.code);
    const preview = await asPerformer('POST', `/tasks/${projectRow.id}/date-change/preview`, { deltaWorkingDays: 1 });
    check('the read-only impact preview still computes (200)', preview.status === 200 && preview.body?.preview !== undefined, preview.status);
    const after = (await asPerformer('GET', `/tasks/${projectRow.id}`)).body?.task;
    check('and its dates did not move', after?.startDate === projectTask?.startDate && after?.dueDate === projectTask?.dueDate);

    await openTask(performerPage, projectRow.id);
    check('performer’s project page: the stage section is drawn', await has(performerPage, '#stage-title'));
    check('performer’s project page: the project date-change panel is drawn', await has(performerPage, '#date-change-title'));
    check('performer’s project page: the responsibility-handoff panel is drawn', await has(performerPage, '#handoff-title'));
    check('performer’s project page: no standalone date panel', !(await has(performerPage, '#standalone-dates-title')));
    await checkDelegationPanel(performerPage, projectTask, 'performer’s project page');
    await screenshot(performerPage, 'project-performer');

    const gcView = await asCommissioner('GET', `/tasks/${projectRow.id}`);
    if (gcView.status === 200) {
      await openTask(commissionerPage, projectRow.id);
      check('GC’s project page: the stage section is drawn', await has(commissionerPage, '#stage-title'));
      check('GC’s project page: the responsibility-handoff panel is drawn', await has(commissionerPage, '#handoff-title'));
      await checkDelegationPanel(commissionerPage, gcView.body.task, 'GC’s project page');
      check('the GC is told they have no private layer on it', gcView.body.task.viewer.hasPrivateLayer === false);
      check('GC’s project page: no private-layer panel', !(await has(commissionerPage, '#private-title')));
      const gcPrivate = await asCommissioner('GET', `/tasks/${projectRow.id}/private`);
      check('a direct private-layer request from the GC still answers 404', gcPrivate.status === 404, gcPrivate.status);
      await screenshot(commissionerPage, 'project-gc');
    } else info('the GC cannot open this project task — GC page checks skipped', gcView.status);
  }

  section('3. D7 — the delegation wall, on the existing delegated QA task (read-only)');
  const delegatedRow = before.find((row) => row.kind === 'project' && row.delegated && !row.viewerIsDelegate);
  if (delegatedRow === undefined) {
    info('the performer holds no delegated task — D7 legs skipped');
  } else {
    const asDelegator = details.get(delegatedRow.id);
    check('the delegator is told who performs', typeof asDelegator?.delegation?.delegateName === 'string');
    const gcSide = await asCommissioner('GET', `/tasks/${delegatedRow.id}`);
    if (gcSide.status === 200) {
      check('the party above is served no delegation at all', gcSide.body.task.delegation === null && gcSide.body.task.viewerIsDelegate === false, gcSide.body.task.delegation);
    }
    await openTask(performerPage, delegatedRow.id);
    await checkDelegationPanel(performerPage, asDelegator, 'delegator’s page');
    if (gcSide.status === 200) {
      await openTask(commissionerPage, delegatedRow.id);
      await checkDelegationPanel(commissionerPage, gcSide.body.task, 'GC’s page of the delegated task');
      const gcText = await commissionerPage.locator('main').evaluate((main) => {
        const copy = main.cloneNode(true);
        copy.querySelectorAll('section[aria-labelledby="handoff-title"] option').forEach((option) => option.remove());
        return copy.textContent ?? '';
      });
      check('the GC’s page never names the delegate outside the project-member picker', !gcText.includes(asDelegator.delegation.delegateName), 'delegate name visible');
    }
    if (delegate !== null) {
      const delegateSide = await as(delegate)('GET', `/tasks/${delegatedRow.id}`);
      if (delegateSide.status === 200 && delegateSide.body.task.viewerIsDelegate) {
        const view = delegateSide.body.task;
        check('the delegate is served no project and no stage', view.project === null && view.stage === null);
        check('the delegate is served no impact count — no sequence information', view.rescheduleImpact === null, view.rescheduleImpact);
        check('the delegate’s counterparty is the delegator, never the GC', view.counterparty?.userId === performer.userId, view.counterparty);
        check(
          'the shared progress reads the same for the delegate, the delegator and the GC',
          view.state === asDelegator.state && (gcSide.status !== 200 || gcSide.body.task.state === asDelegator.state),
          { delegate: view.state, delegator: asDelegator.state, gc: gcSide.body?.task?.state ?? null },
        );
        const delegateRows = (await listAll(as(delegate), '/tasks?limit=50', 'tasks')) ?? [];
        const sharedRow = delegateRows.find((entry) => entry.id === delegatedRow.id);
        check(
          'the delegator’s and the delegate’s rows carry the same start and completion times',
          sharedRow !== undefined && sharedRow.startedAt === delegatedRow.startedAt && sharedRow.completedAt === delegatedRow.completedAt,
          { delegator: [delegatedRow.startedAt, delegatedRow.completedAt], delegate: [sharedRow?.startedAt, sharedRow?.completedAt] },
        );
        const delegatePage = await uiLogin(account('QA-04'));
        await openTask(delegatePage, delegatedRow.id);
        await checkDelegationPanel(delegatePage, view, 'delegate’s page');
        check('the delegate’s page has no stage section', !(await has(delegatePage, '#stage-title')));
        check('the delegate’s page has no responsibility-handoff panel', !(await has(delegatePage, '#handoff-title')));
        check('the delegate’s page has no project date-change panel', !(await has(delegatePage, '#date-change-title')));
        await screenshot(delegatePage, 'delegate-view');
        const facts = (await delegatePage.locator('.dash-facts').textContent()) ?? '';
        check('the delegate’s summary keeps the real task type', /משימה בפרויקט|Project task/.test(facts), facts.slice(0, 120));
        check('and says the project is not shown, never "no project"', /פרטי הפרויקט אינם מוצגים|Project details are not shown/.test(facts) && !/ללא פרויקט|No project/.test(facts), facts.slice(0, 160));
        await delegatePage.goto(`${APP}/tasks`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        const delegateRow = delegatePage.locator('.task-row', { hasText: view.title });
        await delegateRow.first().waitFor({ timeout: 30000 }).catch(() => {});
        const rowText = (await delegateRow.first().textContent()) ?? '';
        check('the delegate’s My Tasks row says the same', /פרטי הפרויקט אינם מוצגים|Project details are not shown/.test(rowText) && !/ללא פרויקט|No project/.test(rowText), rowText.slice(0, 160));
        await screenshot(delegatePage, 'delegate-my-tasks');
      } else info('QA-04 is not the delegate of this task — delegate view skipped', delegateSide.status);
    }
  }

  section('4. A self-created standalone task, through the deployed UI');
  const created = await asPerformer('POST', '/tasks', { kind: 'standalone', title: SOLO_TITLE, startDate: day(40), dueDate: day(44) });
  check('the performer opens a fresh standalone task (201)', created.status === 201, created.status);
  const soloId = created.body?.task?.id;
  if (!soloId) return abort('the standalone fixture could not be created');
  fixtures.soloTaskId = soloId;
  fixtures.soloTitle = SOLO_TITLE;
  const soloDetail = (await asPerformer('GET', `/tasks/${soloId}`)).body?.task;

  await openTask(performerPage, soloId);
  const soloPanel = performerPage.locator('section[aria-labelledby="standalone-dates-title"]');
  check('the standalone date-management panel is drawn', (await soloPanel.count()) === 1);
  check('no project stage section is drawn', !(await has(performerPage, '#stage-title')));
  check('no project date-change panel is drawn', !(await has(performerPage, '#date-change-title')));
  check('no responsibility-handoff panel is drawn', !(await has(performerPage, '#handoff-title')));
  await checkDelegationPanel(performerPage, soloDetail, 'standalone page');
  const soloPanelText = (await soloPanel.textContent()) ?? '';
  check('the originals are labelled as originally agreed', /המועד שסוכם במקור|Originally agreed/.test(soloPanelText));
  check('the history starts empty', /המועדים טרם שונו|have not changed yet/.test(soloPanelText));
  await screenshot(performerPage, 'solo-before');

  const soloSave = await editDatesInUi(performerPage, soloId, { start: day(43), due: day(49), reason: REASON_SOLO });
  check('saving new planned dates in Edit Task succeeds (PATCH 200)', soloSave === 200, soloSave);
  await screenshot(performerPage, 'solo-saved');

  await openTask(performerPage, soloId, true);
  const soloRows = performerPage.locator('section[aria-labelledby="standalone-dates-title"] .dash-history__row');
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

  section('4b. Private sub-task execution, through the deployed UI, on the run’s own task');
  const SUBTASK = `תת-משימת אימות ${runId}`;
  await openTask(performerPage, soloId);
  await performerPage.selectOption('#private-kind', 'subtask');
  await performerPage.fill('#private-body', SUBTASK);
  await performerPage.click('.private-add .btn--primary');
  const subtaskRow = performerPage.locator('.private-item', { hasText: SUBTASK });
  await subtaskRow.waitFor({ timeout: 30000 }).catch(() => {});
  check('a private sub-task is added and shows as not started', (await subtaskRow.locator('.task-chip--not_started').count()) === 1);
  await subtaskRow.getByRole('button', { name: /התחלת ביצוע|^Start$/ }).click();
  await subtaskRow.locator('.task-chip--in_progress').waitFor({ timeout: 30000 }).catch(() => {});
  await openTask(performerPage, soloId, true);
  check('after a refresh it is in progress', (await performerPage.locator('.private-item', { hasText: SUBTASK }).locator('.task-chip--in_progress').count()) === 1);
  await performerPage.locator('.private-item', { hasText: SUBTASK }).getByRole('button', { name: /סיום ביצוע|Mark complete/ }).click();
  await performerPage.locator('.private-item', { hasText: SUBTASK }).locator('.task-chip--completed').waitFor({ timeout: 30000 }).catch(() => {});
  await openTask(performerPage, soloId, true);
  const doneRow = performerPage.locator('.private-item', { hasText: SUBTASK });
  check('after a refresh it is complete, and offers no further action', (await doneRow.locator('.task-chip--completed').count()) === 1 && (await doneRow.getByRole('button', { name: /התחלת ביצוע|סיום ביצוע|^Start$|Mark complete/ }).count()) === 0);
  await doneRow.getByRole('button', { name: /פתיחה|Open/ }).click();
  const detailText = (await doneRow.textContent()) ?? '';
  check('its detail shows when it started and when it completed', /הביצוע התחיל|Started on/.test(detailText) && /הביצוע הסתיים|Completed on/.test(detailText));
  await screenshot(performerPage, 'private-subtask-completed');
  const layer = (await asPerformer('GET', `/tasks/${soloId}/private`)).body?.items ?? [];
  const stored = layer.find((item) => item.body === SUBTASK);
  check('the server holds both stamps', typeof stored?.startedAt === 'string' && typeof stored?.completedAt === 'string' && stored?.done === true);
  const parentAfter = (await asPerformer('GET', `/tasks/${soloId}`)).body?.task;
  check('the task itself did not move — no automatic completion', parentAfter?.state === 'not_started', parentAfter?.state);
  for (const [who, call] of [['commissioner', asCommissioner], ['outsider', asOutsider]]) {
    const read = await call('GET', `/tasks/${soloId}/private`);
    const act = await call('POST', `/tasks/${soloId}/private/${stored?._id}/start`);
    check(`the ${who} cannot read or act on that layer (404)`, read.status === 404 && act.status === 404, [read.status, act.status]);
  }

  section('5. An agreement-born standalone task, and the commissioner’s informational notice');
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

  await openTask(performerPage, bornId);
  const bornPanelText = (await performerPage.locator('section[aria-labelledby="standalone-dates-title"]').textContent()) ?? '';
  check('the panel says the work was born from an agreement', /העבודה נולדה מהסכם|born from an agreement/.test(bornPanelText));
  check('no responsibility-handoff panel on the agreement-born task', !(await has(performerPage, '#handoff-title')));
  await checkDelegationPanel(performerPage, born, 'agreement-born page');
  await screenshot(performerPage, 'born-before');

  const bornSave = await editDatesInUi(performerPage, bornId, { due: day(70), reason: REASON_BORN });
  check('recording the execution delay in Edit Task succeeds (PATCH 200)', bornSave === 200, bornSave);
  await openTask(performerPage, bornId, true);
  const bornRows = performerPage.locator('section[aria-labelledby="standalone-dates-title"] .dash-history__row');
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

  await commissionerPage.goto(`${APP}/notifications`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await commissionerPage.waitForSelector('.notif-row', { timeout: 45000 }).catch(() => {});
  const row = commissionerPage.locator('.notif-row', { hasText: BORN_TITLE });
  check('the notice appears in the commissioner’s notification centre', (await row.count()) === 1, await row.count());
  await screenshot(commissionerPage, 'commissioner-notifications');
  const link = row.locator('.notif-row__actions a');
  check('the notice offers a way to the change', (await link.count()) === 1, await link.count());
  if ((await link.count()) === 1) {
    await link.first().click();
    await commissionerPage.waitForURL((url) => url.pathname === '/tasks', { timeout: 30000 }).catch(() => {});
    const landed = new URL(commissionerPage.url());
    check('following it lands on My Tasks, at this commissioned work', landed.pathname === '/tasks' && landed.searchParams.get('commissioned') === bornId, `${landed.pathname}${landed.search}`);
    const focused = commissionerPage.locator(`#commissioned-${bornId}`);
    await focused.waitFor({ timeout: 30000 }).catch(() => {});
    check('the commissioned row is highlighted', ((await focused.getAttribute('class')) ?? '').includes('task-row--focus') && (await focused.getAttribute('aria-current')) === 'true');
    const focusedText = (await focused.textContent()) ?? '';
    check('it shows the work and its new due date', focusedText.includes(BORN_TITLE) && focusedText.includes(day(70)), focusedText.slice(0, 160));
    await screenshot(commissionerPage, 'commissioner-commissioned-work');
  }
  check(
    'the commissioner’s browser never requested the performer’s task detail',
    !browserRequests.some((r) => r.who === 'QA-02' && (r.path.endsWith(`/tasks/${bornId}`) || r.path.endsWith(`/tasks/${soloId}`))),
  );
  check(
    'no responsibility-handoff request was made for either standalone task',
    !browserRequests.some((r) => r.path.endsWith(`/tasks/${soloId}/handoff`) || r.path.endsWith(`/tasks/${bornId}/handoff`)),
  );

  section('6. Nothing unrelated moved');
  const afterRows = (await listAll(asPerformer, '/tasks?limit=50', 'tasks')) ?? [];
  const afterById = new Map(afterRows.map((entry) => [entry.id, entry]));
  const moved = before.filter((entry) => {
    const current = afterById.get(entry.id);
    return current === undefined || current.startDate !== entry.startDate || current.dueDate !== entry.dueDate || current.state !== entry.state || current.pendingProposal !== entry.pendingProposal || current.delegated !== entry.delegated;
  });
  check('every pre-existing performer task kept its dates, state, delegation and proposal marker', moved.length === 0, moved.map((entry) => entry.id));
  const commissionedAfter = new Map(commissioned.map((entry) => [entry.id, entry]));
  const shifted = commissionedBefore.filter((entry) => commissionedAfter.get(entry.id)?.dueDate !== entry.dueDate);
  check('every pre-existing commissioned task kept its due date', shifted.length === 0, shifted.map((entry) => entry.id));
  if (pendingProposalId) {
    const proposalAfter = (await asCommissioner('GET', `/coordination/proposals/${pendingProposalId}`)).body?.proposal?.status ?? null;
    check('the pending QA date-change proposal is untouched', proposalAfter === proposalBefore, [proposalBefore, proposalAfter]);
  }

  section('7. The deployed frontend stayed healthy');
  check(
    'no page asked for a private layer the viewer does not have',
    !browserRequests.some((r) => r.who === 'QA-02' && r.path.endsWith('/private')),
    browserRequests.filter((r) => r.who === 'QA-02' && r.path.endsWith('/private')),
  );
  check('no uncaught page errors', pageErrors.length === 0, pageErrors);
  check('no application console errors', consoleErrors.length === 0, consoleErrors);
  check('no unexpected failed API responses in the browser', browserHttpErrors.length === 0, browserHttpErrors);


  section('8. Restoring the QA notification baseline');
  for (const [label, call] of [['commissioner', asCommissioner], ['performer', asPerformer]]) {
    const rows = (await feed(call)).filter(
      (entry) =>
        entry.seenAt === null &&
        new Date(entry.createdAt) >= started &&
        (entry.taskId === soloId || entry.taskId === bornId || entry.conversationId === conversation.id),
    );
    if (rows.length > 0) {
      const res = await call('POST', '/notifications/seen', { ids: rows.map((entry) => entry.id) });
      check(`the ${label}’s ${rows.length} run-created notification(s) marked seen`, res.status < 300, res.status);
      markedSeen.push(...rows.map((entry) => ({ account: label, id: entry.id, type: entry.type })));
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
