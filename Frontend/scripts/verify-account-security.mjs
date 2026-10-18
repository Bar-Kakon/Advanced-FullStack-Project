/**
 * Batch 1 (SET-03, SET-04): email change, password change and Google-only password creation, on an
 * isolated local stack. The script starts the API itself and restarts it before each phase, because
 * the auth rate limits count per process. Google is simulated with a locally generated key, and email
 * goes to a local SMTP sink — a pass here never proves Brevo delivery or live Google.
 *
 * Required: APP_URL, API_PORT, MONGO_PORT, MONGO_REPLSET, DB_NAME, SMTP_SINK_PORT, MAIL_FILE,
 * SIMULATED_GOOGLE_CLIENT_ID, SIMULATED_GOOGLE_KEY_FILE, BACKEND_LOG, BACKEND_DIR, DB_DESIGN_FILE.
 */
import './support/developmentGuard.mjs';
import { execSync, spawn } from 'node:child_process';
import { createSign } from 'node:crypto';
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
const SINK_PORT = need('SMTP_SINK_PORT');
const MAIL_FILE = need('MAIL_FILE');
const CLIENT_ID = need('SIMULATED_GOOGLE_CLIENT_ID');
const KEY_FILE = need('SIMULATED_GOOGLE_KEY_FILE');
const BACKEND_LOG = need('BACKEND_LOG');
const BACKEND_DIR = need('BACKEND_DIR');
const DB_DESIGN_FILE = need('DB_DESIGN_FILE');

const PASSWORD = 'CorrectHorse42!';
const NEW_PASSWORD = 'BatteryStaple77!';
const CREATED_PASSWORD = 'PaperClip3000!';
const stamp = Date.now();
const mail = (tag) => `${tag}.${stamp}@example.com`;

let failures = 0;
let passes = 0;
const check = (label, passed, detail = '') => {
  if (passed) passes += 1; else failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(100)} ${detail}`);
};
const unverified = (label, reason) => console.log(`  UNVERIFIED  ${label} — ${reason}`);
const section = (title) => console.log(`\n${title}`);
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// ───────────── API process, restarted per phase ─────────────
let apiProcess = null;
let signingKey = null;

const healthy = async () => {
  try { return (await fetch(`${API}/health`)).ok; } catch { return false; }
};

const startApi = async (label) => {
  const log = openSync(BACKEND_LOG, 'a');
  apiProcess = spawn(`${BACKEND_DIR}/node_modules/.bin/tsx`,
    ['--import', './scripts/support/simulatedGoogleIdentity.ts', 'src/server.ts'], {
      cwd: BACKEND_DIR,
      detached: true,
      stdio: ['ignore', log, log],
      env: {
        ...process.env,
        MONGODB_URI: `mongodb://127.0.0.1:${MONGO}/${DB}?replicaSet=${REPLSET}`,
        PORT: API_PORT,
        NODE_ENV: 'development',
        CORS_ORIGINS: APP,
        FRONTEND_URL: APP,
        API_PUBLIC_URL: `http://localhost:${API_PORT}`,
        SMTP_HOST: '127.0.0.1',
        SMTP_PORT: SINK_PORT,
        SMTP_USER: 'local-sink',
        SMTP_PASS: 'local-sink',
        MAIL_FROM: 'Blokta Local <noreply@blokta.local>',
        GOOGLE_OAUTH_CLIENT_ID: CLIENT_ID,
        SIMULATED_GOOGLE_KEY_FILE: KEY_FILE,
      },
    });
  closeSync(log);
  for (let i = 0; i < 120 && !(await healthy()); i += 1) await sleep(500);
  if (!(await healthy())) throw new Error('the API did not become healthy');
  signingKey = JSON.parse(readFileSync(KEY_FILE, 'utf8'));
  console.log(`  (fresh API process for ${label})`);
};

const stopApi = async () => {
  if (apiProcess === null) return;
  const exited = new Promise((resolve) => apiProcess.once('exit', resolve));
  try { process.kill(-apiProcess.pid, 'SIGTERM'); } catch { /* already gone */ }
  await Promise.race([exited, sleep(8000)]);
  apiProcess = null;
  for (let i = 0; i < 40 && (await healthy()); i += 1) await sleep(250);
};

const phase = async (title, work) => {
  await stopApi();
  section(title);
  await startApi(title.split(' — ')[0]);
  await work();
};

// ───────────── HTTP, database and mail helpers ─────────────
const call = async (method, path, { token, body, cookie } = {}) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* not JSON */ }
  const setCookie = res.headers.get('set-cookie');
  return { status: res.status, body: json, cookie: setCookie ? setCookie.split(';')[0] : null, setCookie };
};

const login = async (email, password) => {
  const answer = await call('POST', '/auth/login', { body: { email, password } });
  return { status: answer.status, token: answer.body?.accessToken ?? null, cookie: answer.cookie };
};

const owner = (given, family, email) => ({
  firstName: given, lastName: family, standing: 'owner', companyName: `${given} Stone ${stamp}`,
  email, registrationCategory: 'supplier', specialty: 'stone_supplier',
  city: 'חיפה', region: 'haifa', availability: 'open', acceptedTerms: true, operationalEmail: false,
});

const mongo = (js) =>
  execSync(`mongosh --port ${MONGO} --quiet --eval '${js.replaceAll("'", `'\\''`)}'`).toString().trim();
const query = (expression) =>
  JSON.parse(mongo(`const d = db.getSiblingDB("${DB}"); print(EJSON.stringify(${expression}, { relaxed: true }))`));
const userBy = (email) => query(`d.users.findOne({ email: ${JSON.stringify(email)} }, { email: 1, passwordHash: 1, identities: 1, security: 1 })`);
const userById = (id) => query(`d.users.findOne({ _id: ObjectId(${JSON.stringify(id)}) }, { email: 1, passwordHash: 1, identities: 1, security: 1 })`);
const idOf = (doc) => doc?._id?.$oid ?? null;
const changeRows = (userId) => query(`d.emailchangetokens.find({ user: ObjectId(${JSON.stringify(userId)}) }).sort({ createdAt: 1 }).toArray()`);
const liveRefreshTokens = (userId) => query(`d.refreshtokens.countDocuments({ user: ObjectId(${JSON.stringify(userId)}), revokedAt: null })`);

const readMails = () => readFileSync(MAIL_FILE, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
const decodeWords = (value) => value
  .replace(/\?=\s+=\?/g, '?==?')
  .replace(/=\?utf-8\?([bq])\?([^?]*)\?=/gi, (_, encoding, text) => (encoding.toLowerCase() === 'b'
    ? Buffer.from(text, 'base64').toString('utf8')
    : Buffer.from(text.replace(/_/g, ' ').replace(/=([0-9a-f]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16))), 'latin1').toString('utf8')));
const decodePart = (headers, body) => {
  const encoding = /content-transfer-encoding:\s*([^\s;]+)/i.exec(headers)?.[1]?.toLowerCase();
  if (encoding === 'base64') return Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8');
  if (encoding === 'quoted-printable') {
    return Buffer.from(body.replace(/=\r\n/g, '').replace(/=([0-9A-F]{2})/gi, (m, hex) => String.fromCharCode(parseInt(hex, 16))), 'latin1').toString('utf8');
  }
  return body;
};
const parseMail = (record) => {
  const split = record.raw.indexOf('\r\n\r\n');
  const head = record.raw.slice(0, split).replace(/\r\n[ \t]+/g, ' ');
  const body = record.raw.slice(split + 4);
  const subject = decodeWords((/^subject:\s*(.*)$/im.exec(head)?.[1] ?? '').trim());
  const boundary = /boundary="?([^";\r\n]+)"?/i.exec(head)?.[1];
  const parts = boundary
    ? body.split(`--${boundary}`).slice(1).filter((part) => !part.startsWith('--')).map((part) => {
      const trimmed = part.replace(/^\r\n/, '');
      const at = trimmed.indexOf('\r\n\r\n');
      return decodePart(trimmed.slice(0, at), trimmed.slice(at + 4));
    })
    : [decodePart(head, body)];
  const text = parts.join('\n');
  const links = [...text.matchAll(/https?:\/\/[^\s"<>]+/g)].map((m) => m[0].replace(/&amp;/g, '&'));
  return { to: record.to, subject, text, links };
};
const mailMark = () => readMails().length;
const mailsTo = (address, since) => readMails().slice(since).map(parseMail).filter((m) => m.to.includes(address.toLowerCase()));
const waitForMail = async (address, since, timeout = 10000) => {
  for (let waited = 0; waited <= timeout; waited += 250) {
    const found = mailsTo(address, since);
    if (found.length > 0) return found[found.length - 1];
    await sleep(250);
  }
  return null;
};
const issuedTokens = [];
const tokenIn = (message, path) => {
  const link = message?.links.find((l) => new URL(l).pathname === path) ?? null;
  const token = link === null ? null : new URL(link).searchParams.get('token');
  if (token) issuedTokens.push(token);
  return { link, token };
};

const b64u = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const googleToken = (who) => {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u({ alg: 'RS256', kid: signingKey.kid, typ: 'JWT' });
  const body = b64u({
    iss: 'https://accounts.google.com', aud: CLIENT_ID, sub: who.sub, email: who.email, email_verified: true,
    given_name: who.given, family_name: who.family, iat: now, exp: now + 3600,
  });
  return `${head}.${body}.${createSign('RSA-SHA256').update(`${head}.${body}`).sign(signingKey.privateKey).toString('base64url')}`;
};

// ───────────── Browser ─────────────
const GIS_STUB = `window.google = { accounts: { id: {
  initialize(options) { window.__gisCallback = options.callback; },
  renderButton(parent, options) {
    const button = document.createElement('button');
    button.type = 'button';
    button.id = 'simulated-google-button';
    button.textContent = 'SIMULATED Google: ' + options.text;
    button.addEventListener('click', () => window.__gisCallback({ credential: window.__simulatedGoogleCredential }));
    parent.appendChild(button);
  },
} } };`;
const pageErrors = [];
let browser;
const newPage = async () => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  await context.addInitScript(() => localStorage.setItem('fieldsync-lang', 'he'));
  await context.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: GIS_STUB }));
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(`${new URL(page.url()).pathname} :: ${error.message}`));
  return page;
};
const uiLogin = async (page, email, password) => {
  await page.goto(`${APP}/login`);
  await page.fill('#email', email);
  await page.fill('#password', password);
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url() === `${API}/auth/login` && r.request().method() === 'POST', { timeout: 20000 }),
    page.click('form button[type="submit"]'),
  ]);
  if (response.status() === 200) await page.waitForURL((url) => url.pathname !== '/login', { timeout: 20000 });
  return response.status();
};
const uiGoogleLogin = async (page, who) => {
  await page.goto(`${APP}/login`);
  const button = page.locator('#simulated-google-button');
  await button.waitFor({ timeout: 15000 });
  await page.evaluate((t) => { window.__simulatedGoogleCredential = t; }, googleToken(who));
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url() === `${API}/auth/google` && r.request().method() === 'POST', { timeout: 20000 }),
    button.click(),
  ]);
  if (response.status() === 200) await page.waitForURL((url) => url.pathname !== '/login', { timeout: 20000 });
  return response.status();
};
const openSettings = async (page) => {
  await page.goto(`${APP}/settings`);
  await page.waitForSelector('[data-testid="account-email"]', { timeout: 20000 });
};
const textOf = async (page, selector) => ((await page.locator(selector).first().textContent().catch(() => '')) ?? '').trim();

// ───────────── People ─────────────
const A = { given: 'אילת', family: 'שינוי', email: mail('ayelet') };
const B = { given: 'בועז', family: 'מתחרה', email: mail('boaz') };
const D = { given: 'דנה', family: 'סיסמה', email: mail('dana') };
const G1 = { given: 'גיל', family: 'גוגל', email: mail('gil.google'), sub: `sim-gil-${stamp}` };
const G2 = { given: 'גלי', family: 'גוגל', email: mail('gali.google'), sub: `sim-gali-${stamp}` };
const G3 = { given: 'זר', family: 'חדש', email: '', sub: `sim-stranger-${stamp}` };
const X = mail('ayelet.new');
const Z = mail('contested');

const run = async () => {
  browser = await chromium.launch();
  let current = { a: A.email };

  await phase('PHASE 1 — email change requested in Settings and confirmed by link', async () => {
    for (const person of [A, B, D]) {
      const answer = await call('POST', '/auth/register', { body: { ...owner(person.given, person.family, person.email), password: PASSWORD, confirmPassword: PASSWORD } });
      check(`register ${person.email}`, answer.status === 201, `status=${answer.status}`);
    }
    for (const person of [G1, G2]) {
      const answer = await call('POST', '/auth/register', { body: { ...owner(person.given, person.family, person.email), googleIdToken: googleToken(person) } });
      check(`register Google-only ${person.email} (simulated identity)`, answer.status === 201 && answer.body?.outcome === 'signed_in', `status=${answer.status}`);
    }
    const aId = idOf(userBy(A.email));
    const bId = idOf(userBy(B.email));
    A.id = aId; B.id = bId; D.id = idOf(userBy(D.email)); G1.id = idOf(userBy(G1.email)); G2.id = idOf(userBy(G2.email));

    section('  1a. Backend refuses unauthenticated calls');
    for (const [path, body] of [['/auth/email-change', { newEmail: X }], ['/auth/password/change', { currentPassword: PASSWORD, newPassword: NEW_PASSWORD }], ['/auth/password/setup', undefined]]) {
      const answer = await call('POST', path, { body });
      check(`POST ${path} without a session → 401`, answer.status === 401, `status=${answer.status}`);
    }

    const a1 = await login(A.email, PASSWORD);
    check('A signs in through the API (session A1, the "other device")', a1.status === 200 && a1.token !== null && a1.cookie !== null, `status=${a1.status}`);

    section('  1b. Request validation and the enumeration-safe answer');
    const same = await call('POST', '/auth/email-change', { token: a1.token, body: { newEmail: A.email } });
    check('new address equal to the current one → 400 EMAIL_CHANGE_SAME_ADDRESS', same.status === 400 && same.body?.code === 'EMAIL_CHANGE_SAME_ADDRESS', `status=${same.status} code=${same.body?.code}`);
    const malformed = await call('POST', '/auth/email-change', { token: a1.token, body: { newEmail: 'not-an-address' } });
    check('malformed address → 400 REQUEST_VALIDATION_FAILED', malformed.status === 400 && malformed.body?.code === 'REQUEST_VALIDATION_FAILED', `status=${malformed.status} code=${malformed.body?.code}`);
    let mark = mailMark();
    const taken = await call('POST', '/auth/email-change', { token: a1.token, body: { newEmail: B.email, userId: bId } });
    check('address already used by another account → same 200 answer as a free one', taken.status === 200 && taken.body?.status === 'ok' && taken.body?.expiresInMinutes === 30, JSON.stringify(taken.body));
    await sleep(2500);
    check('no email is sent to an address another account already uses', mailsTo(B.email, mark).length === 0);
    const takenRows = changeRows(aId);
    check('the row belongs to the session user even with a userId in the body', takenRows.length === 1 && takenRows[0].user.$oid === aId && changeRows(bId).length === 0);
    check('only a 64-hex SHA-256 hash is stored', /^[0-9a-f]{64}$/.test(takenRows[0]?.tokenHash ?? ''));

    section('  1c. Settings → change email (browser, Hebrew)');
    const page = await newPage();
    check('A signs in through the Login screen', (await uiLogin(page, A.email, PASSWORD)) === 200);
    await openSettings(page);
    check('Settings shows the current account address', (await textOf(page, '[data-testid="account-email"]')).includes(A.email));
    check('a password account sees the change-password form', (await page.locator('#settings-current-password').count()) === 1);
    mark = mailMark();
    await page.fill('#settings-new-email', X);
    const [requested] = await Promise.all([
      page.waitForResponse((r) => r.url() === `${API}/auth/email-change` && r.request().method() === 'POST'),
      page.click('#settings-email-submit'),
    ]);
    check('submitting the form requests the change', requested.status() === 200, `status=${requested.status()}`);
    await page.waitForSelector('[data-testid="email-change-sent"]', { timeout: 10000 });
    check('the screen says a link was sent if the address is available', (await textOf(page, '[data-testid="email-change-sent"]')).includes(X));
    await page.reload();
    await page.waitForSelector('[data-testid="email-change-pending"]', { timeout: 15000 });
    check('after a reload the pending request is shown', (await textOf(page, '[data-testid="email-change-pending"]')).includes(X));
    const rows = changeRows(aId);
    check('the earlier request was superseded, the new one is live', rows.length === 2 && rows[0].invalidatedAt !== null && rows[1].invalidatedAt === null && rows[1].newEmail === X);
    const minutes = (Date.parse(rows[1].expiresAt.$date) - Date.now()) / 60000;
    check('the link expires about 30 minutes after issue', minutes > 28 && minutes <= 30.1, `${minutes.toFixed(2)} min`);
    check('the account email is unchanged before confirmation', userById(aId).email === A.email);
    const verification = await waitForMail(X, mark);
    check('a verification email reached the NEW address', verification !== null);
    check('its subject is the Hebrew verification subject', verification?.subject === 'אישור כתובת מייל חדשה — Blokta', verification?.subject ?? '');
    const { link, token } = tokenIn(verification, '/confirm-email-change');
    check('it carries a /confirm-email-change link with a 64-hex token', link !== null && /^[0-9a-f]{64}$/.test(token ?? ''));
    check('nothing was sent to the old address yet', mailsTo(A.email, mark).length === 0);
    check('the old address still signs in before confirmation', (await login(A.email, PASSWORD)).status === 200);
    check('the new address does not sign in before confirmation', (await login(X, PASSWORD)).status === 401);

    section('  1d. Confirmation through the emailed link');
    mark = mailMark();
    await page.goto(link);
    await page.waitForSelector('#confirm-email-change', { timeout: 15000 });
    check('opening the link does not change anything by itself', userById(aId).email === A.email);
    const [confirmed] = await Promise.all([
      page.waitForResponse((r) => r.url() === `${API}/auth/email-change/confirm`),
      page.click('#confirm-email-change'),
    ]);
    check('pressing the button confirms the change', confirmed.status() === 200, `status=${confirmed.status()}`);
    await page.waitForSelector('text=כתובת המייל עודכנה', { timeout: 10000 });
    check('the success screen is shown', true);
    check('the account email is now the new address', userById(aId).email === X);
    const afterRows = changeRows(aId);
    check('the confirmed token is spent', afterRows[1].usedAt !== null);
    check('A1 access token still works after the change, and reads the new email', await (async () => {
      const me = await call('GET', '/auth/me', { token: a1.token });
      return me.status === 200 && me.body?.user?.email === X;
    })());
    const refreshed = await call('POST', '/auth/refresh', { cookie: a1.cookie });
    check('A1 refresh still works (sessions preserved on email change)', refreshed.status === 200, `status=${refreshed.status}`);
    const notice = await waitForMail(A.email, mark);
    check('a security notice reached the OLD address', notice !== null);
    check('the notice names the new address', notice?.text.includes(X) === true);
    check('the notice carries no link with a token', notice !== null && !notice.text.includes('token='));
    check('the notice subject is the Hebrew notice subject', notice?.subject === 'כתובת המייל של החשבון שונתה — Blokta', notice?.subject ?? '');
    check('the new address signs in', (await login(X, PASSWORD)).status === 200);
    check('the old address no longer signs in', (await login(A.email, PASSWORD)).status === 401);
    await openSettings(page);
    check('Settings now shows the new address', (await textOf(page, '[data-testid="account-email"]')).includes(X));

    section('  1e. A reused link is refused');
    const reused = await call('POST', '/auth/email-change/confirm', { body: { token } });
    check('the same token again → 400 INVALID_EMAIL_CHANGE_TOKEN', reused.status === 400 && reused.body?.code === 'INVALID_EMAIL_CHANGE_TOKEN', `status=${reused.status}`);
    await page.goto(link);
    await page.click('#confirm-email-change');
    await page.waitForSelector('text=לא ניתן להשלים את שינוי המייל', { timeout: 10000 });
    check('the confirm screen explains a used link', true);
    const garbage = await call('POST', '/auth/email-change/confirm', { body: { token: 'f'.repeat(64) } });
    check('an unknown token → 400 INVALID_EMAIL_CHANGE_TOKEN', garbage.status === 400 && garbage.body?.code === 'INVALID_EMAIL_CHANGE_TOKEN');
    await page.goto(`${APP}/confirm-email-change`);
    await page.waitForSelector('text=הקישור חסר או אינו שלם', { timeout: 10000 });
    check('a link with no token shows the missing-link message and no button', (await page.locator('#confirm-email-change').count()) === 0);
    check('the account email is still the confirmed address', userById(aId).email === X);
    await page.context().close();
    current.a = X;
  });

  await phase('PHASE 2 — expired and superseded links, and two accounts racing for one address', async () => {
    const a2 = await login(current.a, PASSWORD);
    const b2 = await login(B.email, PASSWORD);
    check('A and B sign in', a2.status === 200 && b2.status === 200);

    section('  2a. Expired link');
    let mark = mailMark();
    const y = mail('ayelet.expired');
    await call('POST', '/auth/email-change', { token: a2.token, body: { newEmail: y } });
    const expiredToken = tokenIn(await waitForMail(y, mark), '/confirm-email-change').token;
    mongo(`db.getSiblingDB("${DB}").emailchangetokens.updateOne({ user: ObjectId("${A.id}"), newEmail: "${y}" }, { $set: { expiresAt: new Date(Date.now() - 60000) } })`);
    const expired = await call('POST', '/auth/email-change/confirm', { body: { token: expiredToken } });
    check('an expired link → 400 INVALID_EMAIL_CHANGE_TOKEN', expired.status === 400 && expired.body?.code === 'INVALID_EMAIL_CHANGE_TOKEN', `status=${expired.status}`);
    check('the account email did not change', userById(A.id).email === current.a);

    section('  2b. A newer request supersedes an older link');
    mark = mailMark();
    const y1 = mail('ayelet.first');
    const y2 = mail('ayelet.second');
    await call('POST', '/auth/email-change', { token: a2.token, body: { newEmail: y1 } });
    const firstToken = tokenIn(await waitForMail(y1, mark), '/confirm-email-change').token;
    await call('POST', '/auth/email-change', { token: a2.token, body: { newEmail: y2 } });
    const superseded = await call('POST', '/auth/email-change/confirm', { body: { token: firstToken } });
    check('the superseded link → 400 INVALID_EMAIL_CHANGE_TOKEN', superseded.status === 400, `status=${superseded.status}`);
    check('the account email did not change', userById(A.id).email === current.a);

    section('  2c. Two accounts confirm the same new address at the same moment');
    mark = mailMark();
    await call('POST', '/auth/email-change', { token: a2.token, body: { newEmail: Z } });
    const aMail = await waitForMail(Z, mark);
    const aToken = tokenIn(aMail, '/confirm-email-change').token;
    const markB = mailMark();
    await call('POST', '/auth/email-change', { token: b2.token, body: { newEmail: Z } });
    const bToken = tokenIn(await waitForMail(Z, markB), '/confirm-email-change').token;
    check('both requests produced their own link to the contested address', aToken !== null && bToken !== null && aToken !== bToken);
    const [ra, rb] = await Promise.all([
      call('POST', '/auth/email-change/confirm', { body: { token: aToken } }),
      call('POST', '/auth/email-change/confirm', { body: { token: bToken } }),
    ]);
    const statuses = [ra.status, rb.status].sort().join(',');
    check('exactly one confirmation succeeds and the other is refused', statuses === '200,400', `A=${ra.status} B=${rb.status}`);
    const holders = query(`d.users.countDocuments({ email: ${JSON.stringify(Z)} })`);
    check('exactly one account holds the contested address', holders === 1, `holders=${holders}`);
    const winnerIsA = ra.status === 200;
    const loserId = winnerIsA ? B.id : A.id;
    const loserBefore = winnerIsA ? B.email : current.a;
    check('the refused account kept its previous address', userById(loserId).email === loserBefore);
    const loserRow = query(`d.emailchangetokens.findOne({ user: ObjectId("${loserId}"), newEmail: ${JSON.stringify(Z)} })`);
    check('the refused confirmation left its token unspent (nothing half-written)', loserRow?.usedAt === null);
    if (winnerIsA) current.a = Z; else B.email = Z;
  });

  await phase('PHASE 3 — one link confirmed twice at once, reset links retired, Google linkage', async () => {
    const a3 = await login(current.a, PASSWORD);
    check('A signs in with the current address', a3.status === 200);

    section('  3a. Old reset links die with the address they were sent to');
    let mark = mailMark();
    await call('POST', '/auth/forgot-password', { body: { email: current.a } });
    const resetToken = tokenIn(await waitForMail(current.a, mark), '/reset-password').token;
    check('a password-reset link was issued to the current address', resetToken !== null);

    section('  3b. The same link confirmed twice in parallel');
    const w = mail('ayelet.final');
    mark = mailMark();
    await call('POST', '/auth/email-change', { token: a3.token, body: { newEmail: w } });
    const wToken = tokenIn(await waitForMail(w, mark), '/confirm-email-change').token;
    const [c1, c2] = await Promise.all([
      call('POST', '/auth/email-change/confirm', { body: { token: wToken } }),
      call('POST', '/auth/email-change/confirm', { body: { token: wToken } }),
    ]);
    check('exactly one of two simultaneous confirmations succeeds', [c1.status, c2.status].sort().join(',') === '200,400', `${c1.status},${c2.status}`);
    check('the account holds the new address', userById(A.id).email === w);
    const previous = current.a;
    current.a = w;
    const reset = await call('POST', '/auth/reset-password', { body: { token: resetToken, password: NEW_PASSWORD } });
    check('the reset link sent to the previous address is refused after the change', reset.status === 401 && reset.body?.code === 'INVALID_RESET_TOKEN', `status=${reset.status}`);
    check('A password is unchanged (signs in with the original password)', (await login(current.a, PASSWORD)).status === 200);
    check('the previous address does not sign in', (await login(previous, PASSWORD)).status === 401);

    section('  3c. Google linkage is by subject, not by email');
    const g = await call('POST', '/auth/google', { body: { idToken: googleToken(G1) } });
    check('G1 signs in with Google', g.status === 200 && g.body?.outcome === 'signed_in', `status=${g.status}`);
    const g1New = mail('gil.office');
    mark = mailMark();
    await call('POST', '/auth/email-change', { token: g.body?.accessToken, body: { newEmail: g1New } });
    const gToken = tokenIn(await waitForMail(g1New, mark), '/confirm-email-change').token;
    const gConfirm = await call('POST', '/auth/email-change/confirm', { body: { token: gToken } });
    check('a Google-only account changes its email without a password or a fresh Google sign-in', gConfirm.status === 200);
    const g1Doc = userById(G1.id);
    check('G1 Blokta email is the new address, different from the Google address', g1Doc.email === g1New && g1New !== G1.email);
    check('the Google identity (subject) is untouched', g1Doc.identities?.length === 1 && g1Doc.identities[0].subject === G1.sub);
    const again = await call('POST', '/auth/google', { body: { idToken: googleToken(G1) } });
    check('Google sign-in with the same subject still reaches G1', again.status === 200 && again.body?.user?.id === G1.id && again.body?.user?.email === g1New, `status=${again.status}`);
    const stranger = await call('POST', '/auth/google', { body: { idToken: googleToken({ ...G3, email: g1New }) } });
    check('an unlinked Google identity using G1 new address is refused, not joined', stranger.status === 409 && stranger.body?.code === 'GOOGLE_LINK_REQUIRED', `status=${stranger.status}`);
    G1.email = g1New;
  });

  await phase('PHASE 4 — Google-only password creation, password change, the popup, refusals, rate limit', async () => {
    section('  4a. A Google-only account adds a password');
    const g = await call('POST', '/auth/google', { body: { idToken: googleToken(G1) } });
    const noPassword = await call('POST', '/auth/password/change', { token: g.body?.accessToken, body: { currentPassword: 'anything-at-all', newPassword: NEW_PASSWORD } });
    check('changing a password on a Google-only account → 409 NO_LOCAL_PASSWORD', noPassword.status === 409 && noPassword.body?.code === 'NO_LOCAL_PASSWORD', `status=${noPassword.status}`);
    const page = await newPage();
    check('G1 signs in with Google on the Login screen', (await uiGoogleLogin(page, G1)) === 200);
    await openSettings(page);
    check('no current-password field is shown to a Google-only account', (await page.locator('#settings-current-password').count()) === 0);
    check('the screen says a sign-in method is being ADDED and Google stays', (await textOf(page, '[data-testid="google-only-note"]')).includes('הכניסה עם Google תישאר זמינה'));
    let mark = mailMark();
    const [setup] = await Promise.all([
      page.waitForResponse((r) => r.url() === `${API}/auth/password/setup`),
      page.click('#settings-password-setup'),
    ]);
    check('requesting the link succeeds', setup.status() === 200);
    await page.waitForSelector('[data-testid="password-setup-sent"]', { timeout: 10000 });
    check('the screen confirms where the link went', (await textOf(page, '[data-testid="password-setup-sent"]')).includes(G1.email));
    const setupMail = await waitForMail(G1.email, mark);
    check('the email is worded as adding a password', setupMail?.subject === 'הוספת סיסמה לחשבון — Blokta', setupMail?.subject ?? '');
    const { link: setupLink, token: setupToken } = tokenIn(setupMail, '/reset-password');
    check('the link uses the reset mechanism with purpose=create', setupLink !== null && new URL(setupLink).searchParams.get('purpose') === 'create' && setupToken !== null);
    const before = userById(G1.id);
    await page.goto(setupLink);
    await page.waitForSelector('text=הוספת סיסמה לחשבון', { timeout: 15000 });
    check('the reset screen is titled as adding a password', true);
    await page.fill('#new-password', CREATED_PASSWORD);
    await page.fill('#confirm-password', CREATED_PASSWORD);
    const [created] = await Promise.all([
      page.waitForResponse((r) => r.url() === `${API}/auth/reset-password`),
      page.click('form.reset-form button[type="submit"]'),
    ]);
    check('creating the password succeeds', created.status() === 200);
    await page.waitForSelector('text=הסיסמה נוספה', { timeout: 10000 });
    check('the success screen says the password was added', true);
    const after = userById(G1.id);
    check('a password hash now exists', typeof after.passwordHash === 'string' && after.passwordHash.length > 0 && !before.passwordHash);
    check('the Google identity is still linked, same subject', after.identities?.length === 1 && after.identities[0].subject === G1.sub);
    check('the token version advanced', (after.security?.tokenVersion ?? 0) === (before.security?.tokenVersion ?? 0) + 1);
    check('G1 signs in with email and password', (await login(G1.email, CREATED_PASSWORD)).status === 200);
    const g2 = await call('POST', '/auth/google', { body: { idToken: googleToken(G1) } });
    check('G1 still signs in with Google', g2.status === 200 && g2.body?.user?.id === G1.id);
    const twice = await call('POST', '/auth/password/setup', { token: g2.body?.accessToken });
    check('asking for a setup link once a password exists → 409 LOCAL_PASSWORD_ALREADY_SET', twice.status === 409 && twice.body?.code === 'LOCAL_PASSWORD_ALREADY_SET', `status=${twice.status}`);
    mark = mailMark();
    await call('POST', '/auth/forgot-password', { body: { email: G2.email } });
    const forgot = await waitForMail(G2.email, mark);
    check('Forgot password on a Google-only account sends the add-a-password wording', forgot?.subject === 'הוספת סיסמה לחשבון — Blokta' && tokenIn(forgot, '/reset-password').link?.includes('purpose=create') === true);
    await page.context().close();

    section('  4b. Password change ends every session, including this device');
    const other = await login(D.email, PASSWORD);
    check('D signs in through the API (the "other device")', other.status === 200);
    const wrong = await call('POST', '/auth/password/change', { token: other.token, body: { currentPassword: 'WrongPassword9!', newPassword: NEW_PASSWORD } });
    check('a wrong current password → 400 CURRENT_PASSWORD_INCORRECT (not 401)', wrong.status === 400 && wrong.body?.code === 'CURRENT_PASSWORD_INCORRECT', `status=${wrong.status}`);
    const weak = await call('POST', '/auth/password/change', { token: other.token, body: { currentPassword: PASSWORD, newPassword: 'short' } });
    check('a too-short new password → 400 REQUEST_VALIDATION_FAILED', weak.status === 400 && weak.body?.code === 'REQUEST_VALIDATION_FAILED', `status=${weak.status}`);
    const dBefore = userById(D.id);
    check('after both refusals the stored hash is unchanged and the session still works', dBefore.passwordHash !== undefined && (await call('GET', '/auth/me', { token: other.token })).status === 200);

    const dPage = await newPage();
    check('D signs in on the Login screen (this device)', (await uiLogin(dPage, D.email, PASSWORD)) === 200);
    await openSettings(dPage);
    await dPage.fill('#settings-current-password', PASSWORD);
    await dPage.fill('#settings-new-password', NEW_PASSWORD);
    await dPage.fill('#settings-confirm-password', NEW_PASSWORD);
    const deviceToken = await dPage.evaluate(() => localStorage.getItem('fieldsync-access-token'));
    const navigations = [];
    dPage.on('framenavigated', (frame) => { if (frame === dPage.mainFrame()) navigations.push(new URL(frame.url()).pathname); });
    const [changed] = await Promise.all([
      dPage.waitForResponse((r) => r.url() === `${API}/auth/password/change`),
      dPage.click('#settings-password-submit'),
    ]);
    check('the change succeeds', changed.status() === 200, `status=${changed.status()}`);
    await dPage.waitForSelector('.session-notice', { timeout: 10000 });
    check('the success popup appears', (await textOf(dPage, '#session-notice-title')) === 'הסיסמה שונתה בהצלחה');
    const dAfter = userById(D.id);
    check('the stored hash changed', dAfter.passwordHash !== dBefore.passwordHash);
    check('the token version advanced by one', (dAfter.security?.tokenVersion ?? 0) === (dBefore.security?.tokenVersion ?? 0) + 1);
    check('no live refresh token remains for D', liveRefreshTokens(D.id) === 0);
    check('the other device access token is refused', (await call('GET', '/auth/me', { token: other.token })).status === 401);
    check('the other device refresh is refused', (await call('POST', '/auth/refresh', { cookie: other.cookie })).status === 401);
    check('this device token is refused before the popup is acknowledged', (await call('GET', '/auth/me', { token: deviceToken })).status === 401);

    section('  4c. The popup survives background activity until acknowledged');
    const appRequest = await dPage.evaluate(async () => {
      const client = await import('/src/api/client.ts');
      try { await client.api.get('/settings'); return 'resolved'; } catch (error) { return error?.response?.status ?? 'network'; }
    });
    check('a real request through the app HTTP client fails with 401', appRequest === 401, String(appRequest));
    await dPage.evaluate(() => {
      window.dispatchEvent(new Event('auth:session-expired'));
      window.dispatchEvent(new StorageEvent('storage', { key: 'fieldsync-access-token' }));
    });
    await dPage.mouse.click(8, 8);
    await sleep(6000);
    check('after 6 seconds, a forced session-expired event, a storage event and a backdrop click the popup is still visible', await dPage.locator('.session-notice').isVisible());
    check('the page did not redirect (still /settings)', new URL(dPage.url()).pathname === '/settings' && !navigations.includes('/login'), navigations.join(' > '));
    await dPage.click('.session-notice__action');
    await dPage.waitForURL((url) => url.pathname === '/login', { timeout: 10000 });
    check('"המשך להתחברות" leads to the Login screen', true);
    const storage = await dPage.evaluate(() => ({ token: localStorage.getItem('fieldsync-access-token'), user: localStorage.getItem('fieldsync-user') }));
    check('the device holds no token and no user after acknowledgement', storage.token === null && storage.user === null);
    check('the old password no longer signs in', (await login(D.email, PASSWORD)).status === 401);
    check('the new password signs in on the Login screen', (await uiLogin(dPage, D.email, NEW_PASSWORD)) === 200);
    await dPage.context().close();

    section('  4d. Backend refusals and rate limiting');
    for (const path of ['/auth/email-change', '/auth/password/setup']) {
      const answer = await call('POST', path, { token: other.token, body: path === '/auth/email-change' ? { newEmail: mail('late') } : undefined });
      check(`POST ${path} with a token revoked by the password change → 401`, answer.status === 401, `status=${answer.status}`);
    }
    const a4 = await login(current.a, PASSWORD);
    const setupOnPassword = await call('POST', '/auth/password/setup', { token: a4.token });
    check('a password account asking for a setup link → 409 LOCAL_PASSWORD_ALREADY_SET', setupOnPassword.status === 409);
    const statuses = [];
    for (let i = 0; i < 11; i += 1) statuses.push((await call('POST', '/auth/email-change/confirm', { body: { token: `${i}`.repeat(64).slice(0, 64) } })).status);
    check('confirmation attempts are rate-limited (10 answered, the 11th → 429)', statuses.slice(0, 10).every((s) => s === 400) && statuses[10] === 429, statuses.join(','));
  });

  await stopApi();

  section('Logs and documentation');
  const log = readFileSync(BACKEND_LOG, 'utf8');
  check(`no issued token (${issuedTokens.length} collected from the emails) appears in the API log`, issuedTokens.length > 0 && issuedTokens.every((t) => !log.includes(t)));
  check('the API ran in SMTP mode throughout (no log-mode link lines)', !log.includes('(log mode only)') && !log.includes('running in log mode'));
  const docPage = await browser.newPage();
  docPage.on('pageerror', (error) => pageErrors.push(`database-design :: ${error.message}`));
  await docPage.goto(`file://${DB_DESIGN_FILE}`);
  await docPage.waitForTimeout(1500);
  check('the database design page renders the emailchangetokens collection', (await docPage.locator('text=emailchangetokens').count()) > 0);
  await docPage.close();
  check('no uncaught page errors in any screen', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  section('Not proven by this run');
  unverified('real email delivery through Brevo', 'mail went to a local SMTP sink; delivery is pending production verification');
  unverified('live Google OAuth', 'Google was simulated with a locally generated signing key');
  unverified('production frontend and backend', 'nothing was deployed');

  await browser.close();
  console.log(`\n${passes} PASS, ${failures} FAIL`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch(async (error) => {
  console.error('ABORTED:', error instanceof Error ? error.message : error);
  await stopApi().catch(() => undefined);
  await browser?.close().catch(() => undefined);
  console.log(`\n${passes} PASS, ${failures} FAIL (aborted)`);
  process.exit(1);
});
