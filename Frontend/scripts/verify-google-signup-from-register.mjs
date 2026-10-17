/**
 * QA-005 / QA-006 / QA-007: Google sign-up started on /register, on an isolated local stack with a
 * SIMULATED Google identity. Google's browser script and signing key are stand-ins; every Blokta line
 * runs for real, so a pass here never proves live Google OAuth.
 *
 * The API runs with `--import ./scripts/support/simulatedGoogleIdentity.ts` and GOOGLE_OAUTH_CLIENT_ID
 * equal to SIMULATED_GOOGLE_CLIENT_ID; the client runs with that VITE_GOOGLE_OAUTH_CLIENT_ID and an
 * empty VITE_GOOGLE_MAPS_API_KEY. Required here: APP_URL, API_URL, MONGO_PORT, DB_NAME,
 * SIMULATED_GOOGLE_CLIENT_ID, SIMULATED_GOOGLE_KEY_FILE, BACKEND_LOG.
 */
import './support/developmentGuard.mjs';
import { execSync } from 'node:child_process';
import { createSign, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const need = (name) => {
  const value = process.env[name];
  if (!value) { console.error(`missing ${name}`); process.exit(2); }
  return value;
};
const APP = need('APP_URL');
const API = need('API_URL');
const MONGO = need('MONGO_PORT');
const DB = need('DB_NAME');
const CLIENT_ID = need('SIMULATED_GOOGLE_CLIENT_ID');
const KEY_FILE = need('SIMULATED_GOOGLE_KEY_FILE');
const BACKEND_LOG = need('BACKEND_LOG');
const SHOTS = process.env.SHOTS ?? '.';

const PASSWORD = 'CorrectHorse42!';
const stamp = Date.now();

let failures = 0;
let passes = 0;
const check = (label, passed, detail = '') => {
  if (passed) passes += 1; else failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(96)} ${detail}`);
};
const unverified = (label, blocker) => console.log(`  UNVERIFIED  ${label} — ${blocker}`);
const section = (title) => console.log(`\n${title}`);

const mongo = (js) =>
  execSync(`mongosh --port ${MONGO} --quiet --eval '${js.replaceAll("'", `'\\''`)}'`).toString().trim();
const users = (filter) => JSON.parse(mongo(`print(JSON.stringify(db.getSiblingDB("${DB}").users.aggregate([
  { $match: ${JSON.stringify(filter)} },
  { $project: { _id: { $toString: "$_id" }, email: 1, status: 1,
    hasPasswordHash: { $eq: [{ $type: "$passwordHash" }, "string"] },
    identities: { $map: { input: { $ifNull: ["$identities", []] }, in: { provider: "$$this.provider", subject: "$$this.subject" } } } } },
]).toArray()))`));

const issued = [];
const answers = [];
const requestTrail = [];
const consoleTrail = [];
const consoleErrors = [];
const pageErrors = [];

const api = async (method, path, token, json) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
  const text = await res.text();
  answers.push(text);
  let body = null;
  try { body = JSON.parse(text); } catch { /* empty */ }
  if (typeof body?.accessToken === 'string') issued.push(body.accessToken);
  return { status: res.status, body, setCookie: res.headers.get('set-cookie') };
};

const { kid, privateKey } = JSON.parse(readFileSync(KEY_FILE, 'utf8'));
const strangerKey = generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey;
const b64u = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const minted = [];
const googleToken = (who, { aud = CLIENT_ID, key = privateKey, verified = true } = {}) => {
  const now = Math.floor(Date.now() / 1000);
  const head = b64u({ alg: 'RS256', kid, typ: 'JWT' });
  const body = b64u({
    iss: 'https://accounts.google.com', aud, sub: who.sub, email: who.email, email_verified: verified,
    given_name: who.given, family_name: who.family, iat: now, exp: now + 3600,
  });
  const token = `${head}.${body}.${createSign('RSA-SHA256').update(`${head}.${body}`).sign(key).toString('base64url')}`;
  minted.push(token);
  return token;
};
const signatureOf = (token) => token.split('.')[2];
const carriesToken = (text) => minted.some((token) => text.includes(signatureOf(token)));

const person = (tag, given, family) => ({ sub: `sim-${tag}-${stamp}`, email: `g.${tag}.${stamp}@example.com`, given, family });
const NOA = person('noa', 'נועה', 'גוגל');
const OMER = person('omer', 'עומר', 'שרת');
const LIOR = person('lior', 'ליאור', 'כניסה');
const DANA = person('dana', 'Dana', 'English');
const ROGUE = person('rogue', 'זר', 'מזויף');
const TYPED_EMAIL = `typed.by.hand.${stamp}@example.com`;
const OTHER_EMAIL = `someone.else.${stamp}@example.com`;

const owner = (given, family, email) => ({
  firstName: given, lastName: family, standing: 'owner', companyName: `${given} Stone ${stamp}`,
  email, registrationCategory: 'supplier', specialty: 'stone_supplier',
  city: 'חיפה', region: 'haifa', availability: 'open', acceptedTerms: true, operationalEmail: false,
});

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

let browser;
const openPage = async (lang = 'he') => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  await page.addInitScript((l) => localStorage.setItem('fieldsync-lang', l), lang);
  await page.route('https://accounts.google.com/gsi/client', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body: GIS_STUB }));
  page.on('request', (r) => requestTrail.push(`${r.url()} ${r.headers()['referer'] ?? ''}`));
  page.on('console', (m) => {
    consoleTrail.push(m.text());
    if (m.type() === 'error') consoleErrors.push(`${new URL(page.url()).pathname} :: ${m.text()}`);
  });
  page.on('pageerror', (e) => pageErrors.push(`${new URL(page.url()).pathname} :: ${e.message}`));
  return page;
};

const pressGoogle = async (page, token) => {
  const button = page.locator('#simulated-google-button');
  await button.waitFor({ timeout: 15000 });
  await page.evaluate((t) => { window.__simulatedGoogleCredential = t; }, token);
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url() === `${API}/auth/google` && r.request().method() === 'POST', { timeout: 20000 }),
    button.click(),
  ]);
  await page.evaluate(() => { delete window.__simulatedGoogleCredential; });
  const text = await response.text().catch(() => '');
  answers.push(text);
  let body = null;
  try { body = JSON.parse(text); } catch { /* empty */ }
  if (typeof body?.accessToken === 'string') issued.push(body.accessToken);
  return { status: response.status(), body };
};

const fillBusiness = async (page, company) => {
  await page.selectOption('#registrationCategory', 'supplier');
  await page.selectOption('#specialty', 'stone_supplier');
  await page.fill('#companyName', company);
  await page.fill('input#city', 'חיפה');
  await page.selectOption('#region', 'haifa');
};

const toStepTwo = async (page) => {
  await page.click('#register-next');
  await page.locator('#operationalEmail-decline').check();
  await page.locator('input[name="acceptedTerms"]').check();
};

const submitRegistration = async (page) => {
  const submit = page.locator('.reg-nav button[type="submit"]');
  const label = (await submit.textContent()) ?? '';
  const [response] = await Promise.all([
    page.waitForResponse((r) => r.url() === `${API}/auth/register` && r.request().method() === 'POST', { timeout: 20000 }),
    submit.click(),
  ]);
  const text = await response.text().catch(() => '');
  answers.push(text);
  let body = null;
  try { body = JSON.parse(text); } catch { /* empty */ }
  if (typeof body?.accessToken === 'string') issued.push(body.accessToken);
  const headers = await response.allHeaders();
  return { label, status: response.status(), body, sent: JSON.parse(response.request().postData() ?? '{}'), setCookie: headers['set-cookie'] ?? null };
};

const googleModeOf = async (page) => ({
  email: await page.inputValue('#email'),
  readOnly: (await page.locator('#email').getAttribute('readonly')) !== null,
  firstName: await page.inputValue('#firstName'),
  lastName: await page.inputValue('#lastName'),
  passwordFields: (await page.locator('#password').count()) + (await page.locator('#password-confirm').count()),
  notice: (await page.locator('.form-note--google').first().textContent().catch(() => '')) ?? '',
  googleButtons: await page.locator('#simulated-google-button').count(),
});

const exposure = async (page) => page.evaluate(() => ({
  dom: document.documentElement.outerHTML,
  url: location.href,
  storage: JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
  historyCredential: typeof history.state?.usr?.google?.idToken === 'string',
}));

const run = async () => {
  browser = await chromium.launch();
  console.log('MODE: SIMULATED Google identity provider. Not a real Google OAuth test.');
  console.log(`API ${API} · APP ${APP} · DB ${DB} on 127.0.0.1:${MONGO}`);

  section('A. QA-005 / QA-006 / QA-007 — a new person presses Google directly on /register (he, RTL)');
  {
    const page = await openPage('he');
    await page.goto(`${APP}/register`, { waitUntil: 'networkidle' });
    check('the flow starts on /register, with the Google button rendered there',
      new URL(page.url()).pathname === '/register' && (await page.locator('#simulated-google-button').count()) === 1, page.url());

    await page.fill('#firstName', 'הקלדה');
    await page.fill('#email', TYPED_EMAIL);
    await page.fill('#password', PASSWORD);
    await page.fill('#password-confirm', PASSWORD);

    const token = googleToken(NOA);
    const answer = await pressGoogle(page, token);
    check('the server verified the identity and answered onboarding_required',
      answer.status === 200 && answer.body?.outcome === 'onboarding_required', `status=${answer.status} outcome=${answer.body?.outcome}`);
    await page.locator('.form-note--google').waitFor({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(400);
    const mode = await googleModeOf(page);

    check('QA-005  the person stays on /register to finish', new URL(page.url()).pathname === '/register', page.url());
    check('QA-005  the notice names the Google email', mode.notice.includes(NOA.email));
    check('QA-005  the email field holds the Google email', mode.email === NOA.email, `value=${mode.email}`);
    check('QA-005  first and last name come from Google', mode.firstName === NOA.given && mode.lastName === NOA.family,
      `first=${mode.firstName} last=${mode.lastName}`);
    check('QA-005  no second Google button while finishing this signup', mode.googleButtons === 0, `count=${mode.googleButtons}`);

    check('QA-006  the email input is read-only', mode.readOnly);
    check('QA-006  the lock explains itself', (await page.getByText('הכתובת מגיעה מחשבון ה-Google ואינה ניתנת לעריכה.').count()) === 1);
    await page.click('#email');
    await page.keyboard.press('End');
    await page.keyboard.type('zz');
    await page.keyboard.press('ControlOrMeta+a');
    await page.keyboard.press('Delete');
    check('QA-006  typing and deleting in the email field change nothing', (await page.inputValue('#email')) === NOA.email,
      `value=${await page.inputValue('#email')}`);

    check('QA-007  there are no password fields', mode.passwordFields === 0, `count=${mode.passwordFields}`);
    check('QA-007  the screen says the account opens with no password',
      (await page.getByText('החשבון ייפתח ללא סיסמה, וההתחברות תתבצע דרך Google.').count()) === 1);

    const seen = await exposure(page);
    check('token  the ID token is not in the rendered DOM', !seen.dom.includes(signatureOf(token)));
    check('token  the ID token is not in the address', !seen.url.includes(signatureOf(token)), seen.url);
    check('token  the ID token is not in localStorage or sessionStorage', !seen.storage.includes(signatureOf(token)));
    check('token  it travels only in the history entry\'s navigation state, as designed', seen.historyCredential);
    await page.screenshot({ path: `${SHOTS}/A-register-google-he.png`, fullPage: true });

    await fillBusiness(page, `Noa Stone ${stamp}`);
    check('QA-007  Step 1 completes with no password', await page.locator('#register-next').isEnabled());
    if (await page.locator('#register-next').isEnabled()) {
      await toStepTwo(page);
      const reg = await submitRegistration(page);
      check('the submit is named as finishing a Google signup', reg.label.includes('סיום ההרשמה'), reg.label);
      check('QA-006  the request carries the Google email, not the hand-typed one', reg.sent.email === NOA.email, `email=${reg.sent.email}`);
      check('QA-007  the request carries the Google token and no password field',
        typeof reg.sent.googleIdToken === 'string' && !('password' in reg.sent) && !('confirmPassword' in reg.sent),
        `keys=${Object.keys(reg.sent).filter((k) => /pass|google/i.test(k)).join(',')}`);
      check('QA-007  the account is created: 201 signed_in with an access token',
        reg.status === 201 && reg.body?.outcome === 'signed_in' && typeof reg.body?.accessToken === 'string', `status=${reg.status}`);
      check('session  a refresh cookie is set (HttpOnly, Path=/api/auth)',
        reg.setCookie !== null && /refreshToken=/.test(reg.setCookie) && /HttpOnly/i.test(reg.setCookie) && /Path=\/api\/auth/i.test(reg.setCookie));

      await page.waitForURL('**/dashboard', { timeout: 15000 }).catch(() => {});
      check('session  an active owner lands on /dashboard', new URL(page.url()).pathname === '/dashboard', page.url());
      check('token  once registered, the history entry no longer carries the credential', !(await exposure(page)).historyCredential);
      const stored = await page.evaluate(() => localStorage.getItem('fieldsync-access-token'));
      check('session  the client stored an access token', typeof stored === 'string' && stored.length > 20);
      const me = await api('GET', '/auth/me', stored);
      check('session  /auth/me answers for the Google account', me.status === 200 && me.body?.user?.email === NOA.email, `status=${me.status}`);
      const refreshed = await page.evaluate(async (base) => {
        const r = await fetch(`${base}/auth/refresh`, { method: 'POST', credentials: 'include' });
        const b = await r.json().catch(() => null);
        return { status: r.status, token: b?.accessToken ?? null };
      }, API);
      if (refreshed.token) issued.push(refreshed.token);
      check('session  the refresh cookie rotates into a new access token', refreshed.status === 200 && typeof refreshed.token === 'string');
    }

    const docs = users({ email: NOA.email });
    check('DB  exactly one account for the Google email', docs.length === 1, `count=${docs.length}`);
    check('DB  it has no password hash', docs[0]?.hasPasswordHash === false);
    check('DB  it is linked to the Google subject',
      docs[0]?.identities?.length === 1 && docs[0].identities[0].provider === 'google' && docs[0].identities[0].subject === NOA.sub);
    check('DB  the hand-typed email opened nothing', users({ email: TYPED_EMAIL }).length === 0);
    await page.close();
  }

  section('B. QA-006 server half — the backend enforces the verified identity (direct API)');
  {
    const mismatch = await api('POST', '/auth/register', undefined, { ...owner('עומר', 'שרת', OTHER_EMAIL), googleIdToken: googleToken(OMER) });
    check('a Google token with a different email in the body is refused GOOGLE_EMAIL_MISMATCH',
      mismatch.status === 409 && mismatch.body?.code === 'GOOGLE_EMAIL_MISMATCH', `status=${mismatch.status} code=${mismatch.body?.code}`);
    const both = await api('POST', '/auth/register', undefined, {
      ...owner('עומר', 'שרת', OMER.email), googleIdToken: googleToken(OMER), password: PASSWORD, confirmPassword: PASSWORD,
    });
    check('a password beside a Google token is refused', both.status === 400 && both.body?.code === 'REQUEST_VALIDATION_FAILED',
      `status=${both.status} code=${both.body?.code}`);
    const forged = await api('POST', '/auth/register', undefined, { ...owner('עומר', 'שרת', OMER.email), googleIdToken: googleToken(OMER, { key: strangerKey }) });
    check('a token signed by any other key is refused INVALID_GOOGLE_CREDENTIAL',
      forged.status === 401 && forged.body?.code === 'INVALID_GOOGLE_CREDENTIAL', `status=${forged.status} code=${forged.body?.code}`);
    const audience = await api('POST', '/auth/register', undefined, {
      ...owner('עומר', 'שרת', OMER.email), googleIdToken: googleToken(OMER, { aud: 'another-client.apps.googleusercontent.com' }),
    });
    check('a token issued for another OAuth client is refused INVALID_GOOGLE_CREDENTIAL',
      audience.status === 401 && audience.body?.code === 'INVALID_GOOGLE_CREDENTIAL', `status=${audience.status} code=${audience.body?.code}`);
    const unverifiedEmail = await api('POST', '/auth/register', undefined, {
      ...owner('עומר', 'שרת', OMER.email), googleIdToken: googleToken(OMER, { verified: false }),
    });
    check('a Google email Google has not verified is refused GOOGLE_EMAIL_NOT_VERIFIED',
      unverifiedEmail.status === 401 && unverifiedEmail.body?.code === 'GOOGLE_EMAIL_NOT_VERIFIED', `status=${unverifiedEmail.status} code=${unverifiedEmail.body?.code}`);
    check('DB  none of the five refusals created an account',
      users({ email: { $in: [OMER.email, OTHER_EMAIL] } }).length === 0);
  }

  section('C. Google pressed on Login by a new person (the entry that already worked)');
  {
    const page = await openPage('he');
    await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
    const answer = await pressGoogle(page, googleToken(LIOR));
    await page.waitForURL('**/register', { timeout: 10000 }).catch(() => {});
    await page.locator('.form-note--google').waitFor({ timeout: 10000 }).catch(() => {});
    const mode = await googleModeOf(page);
    check('onboarding_required carries the person to /register',
      answer.body?.outcome === 'onboarding_required' && new URL(page.url()).pathname === '/register', page.url());
    check('the Google email is prefilled and read-only', mode.email === LIOR.email && mode.readOnly, `value=${mode.email}`);
    check('there are no password fields', mode.passwordFields === 0);
    await page.close();
  }

  section('D. An existing Google user signs in normally, from Login and from Register');
  {
    const fromLogin = await openPage('he');
    await fromLogin.goto(`${APP}/login`, { waitUntil: 'networkidle' });
    const a1 = await pressGoogle(fromLogin, googleToken(NOA));
    await fromLogin.waitForURL('**/dashboard', { timeout: 15000 }).catch(() => {});
    check('Login: the linked identity answers signed_in for the same account',
      a1.status === 200 && a1.body?.outcome === 'signed_in' && a1.body?.user?.email === NOA.email, `status=${a1.status}`);
    check('Login: the person lands on /dashboard', new URL(fromLogin.url()).pathname === '/dashboard', fromLogin.url());
    await fromLogin.close();

    const fromRegister = await openPage('he');
    await fromRegister.goto(`${APP}/register`, { waitUntil: 'networkidle' });
    const a2 = await pressGoogle(fromRegister, googleToken(NOA));
    await fromRegister.waitForURL('**/dashboard', { timeout: 15000 }).catch(() => {});
    check('Register: the same identity is signed in, not offered a second signup',
      a2.body?.outcome === 'signed_in' && new URL(fromRegister.url()).pathname === '/dashboard', fromRegister.url());
    await fromRegister.close();

    check('DB  still exactly one account holds that Google subject', users({ 'identities.subject': NOA.sub }).length === 1);
  }

  section('E. No duplicate account for an identity that already has one');
  {
    const again = await api('POST', '/auth/register', undefined, { ...owner('נועה', 'גוגל', NOA.email), googleIdToken: googleToken(NOA) });
    check('a second Google registration for the same identity is refused',
      again.status === 409 && ['EMAIL_ALREADY_REGISTERED', 'GOOGLE_IDENTITY_CLAIMED'].includes(again.body?.code), `status=${again.status} code=${again.body?.code}`);
    check('DB  still exactly one account for that email', users({ email: NOA.email }).length === 1);
  }

  section('F. Account linking is unchanged: no auto-link, explicit link from a signed-in session');
  {
    const email = `p.link.${stamp}@example.com`;
    const LINK = { sub: `sim-link-${stamp}`, email, given: 'Pat', family: 'Link' };
    const fixture = await api('POST', '/auth/register', undefined, { ...owner('Pat', 'Password', email), password: PASSWORD, confirmPassword: PASSWORD });
    check('fixture: a password account through the real endpoint', fixture.status === 201, `status=${fixture.status}`);

    const page = await openPage('he');
    await page.goto(`${APP}/register`, { waitUntil: 'networkidle' });
    const refused = await pressGoogle(page, googleToken(LINK));
    await page.waitForTimeout(500);
    check('Google with a password account\'s email is refused GOOGLE_LINK_REQUIRED',
      refused.status === 409 && refused.body?.code === 'GOOGLE_LINK_REQUIRED', `status=${refused.status} code=${refused.body?.code}`);
    check('the refusal is shown in words',
      (await page.getByText('לכתובת הזו כבר קיים חשבון עם סיסמה. יש להתחבר עם הסיסמה, ואז לקשר את Google מתוך החשבון.').count()) === 1);
    check('the form stays the password form (no Google mode)',
      (await page.locator('#password').count()) === 1 && (await page.locator('.form-note--google').count()) === 0);
    await page.close();

    const login = await api('POST', '/auth/login', undefined, { email, password: PASSWORD });
    const link = await api('POST', '/auth/google/link', login.body?.accessToken, { idToken: googleToken(LINK) });
    check('the existing link route attaches Google to the signed-in account', link.status === 200 && link.body?.linkedEmail === email,
      `status=${link.status}`);
    const after = await api('POST', '/auth/google', undefined, { idToken: googleToken(LINK) });
    check('the linked identity now signs in to the SAME account',
      after.status === 200 && after.body?.outcome === 'signed_in' && after.body?.user?.id === login.body?.user?.id, `status=${after.status}`);
    const docs = users({ email });
    check('DB  one account, password kept, Google subject attached',
      docs.length === 1 && docs[0].hasPasswordHash === true && docs[0].identities.some((i) => i.subject === LINK.sub));
  }

  section('G. Standard email/password registration through the UI is unchanged (D30)');
  {
    const email = `std.${stamp}@example.com`;
    const page = await openPage('he');
    await page.goto(`${APP}/register`, { waitUntil: 'networkidle' });
    await page.fill('#firstName', 'רגיל');
    await page.fill('#lastName', 'סיסמה');
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.fill('#password-confirm', PASSWORD);
    await fillBusiness(page, `Std Stone ${stamp}`);
    await page.locator('.lang-switch button', { hasText: 'EN' }).click();
    await page.locator('.lang-switch button', { hasText: 'עב' }).click();
    check('switching language mid-form keeps every typed value',
      (await page.inputValue('#email')) === email && (await page.inputValue('#password')) === PASSWORD
        && (await page.inputValue('#companyName')) === `Std Stone ${stamp}`);
    check('the email field is editable on the password path', (await page.locator('#email').getAttribute('readonly')) === null);
    check('Step 1 completes with a password', await page.locator('#register-next').isEnabled());
    await toStepTwo(page);
    const reg = await submitRegistration(page);
    check('the request carries the password pair and no Google token',
      reg.sent.password === PASSWORD && reg.sent.confirmPassword === PASSWORD && !('googleIdToken' in reg.sent));
    check('201 with the account alone: no access token, no cookie',
      reg.status === 201 && reg.body?.user !== undefined && reg.body?.accessToken === undefined && reg.setCookie === null, `status=${reg.status}`);
    await page.waitForURL('**/login', { timeout: 15000 }).catch(() => {});
    check('the person is sent to Login', new URL(page.url()).pathname === '/login', page.url());
    const docs = users({ email });
    check('DB  one account, with a password hash and no Google identity',
      docs.length === 1 && docs[0].hasPasswordHash === true && docs[0].identities.length === 0);
    await page.close();
  }

  section('H. The same /register-origin flow in English (LTR)');
  {
    const page = await openPage('en');
    await page.goto(`${APP}/register`, { waitUntil: 'networkidle' });
    const answer = await pressGoogle(page, googleToken(DANA));
    await page.locator('.form-note--google').waitFor({ timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(400);
    const mode = await googleModeOf(page);
    check('onboarding_required', answer.body?.outcome === 'onboarding_required');
    check('the page is LTR', (await page.evaluate(() => document.documentElement.dir)) === 'ltr');
    check('QA-005  email and names come from Google', mode.email === DANA.email && mode.firstName === 'Dana' && mode.lastName === 'English',
      `email=${mode.email}`);
    check('QA-006  the email is read-only, with the English hint',
      mode.readOnly && (await page.getByText('This address comes from the Google account and cannot be edited.').count()) === 1);
    check('QA-007  no password fields, with the English note',
      mode.passwordFields === 0 && (await page.getByText('The account opens with no password, and you sign in through Google.').count()) === 1);
    await page.screenshot({ path: `${SHOTS}/H-register-google-en.png`, fullPage: true });
    await page.close();
  }

  section('J. The ID token is never exposed: a refused credential on /register, then the whole run');
  {
    const page = await openPage('he');
    await page.goto(`${APP}/register`, { waitUntil: 'networkidle' });
    const rogue = googleToken(ROGUE, { key: strangerKey });
    const refused = await pressGoogle(page, rogue);
    await page.waitForTimeout(500);
    const alert = (await page.locator('.form-alert, [role="alert"]').first().textContent().catch(() => '')) ?? '';
    check('a credential the server cannot verify is refused INVALID_GOOGLE_CREDENTIAL',
      refused.status === 401 && refused.body?.code === 'INVALID_GOOGLE_CREDENTIAL', `status=${refused.status}`);
    check('the refusal reaches the person in words that carry no token', alert.length > 0 && !carriesToken(alert), alert.slice(0, 60));
    check('the refused credential is not in the DOM or the address', !carriesToken((await exposure(page)).dom) && !carriesToken(page.url()));
    check('the form stays the password form', (await page.locator('#password').count()) === 1);
    await page.close();

    check(`no ID token appears in any request URL or Referer (${requestTrail.length} requests)`, !requestTrail.some(carriesToken));
    check(`no ID token appears in any browser console message (${consoleTrail.length} messages)`, !consoleTrail.some(carriesToken));
    check(`no ID token appears in any server answer, error answers included (${answers.length} answers)`, !answers.some(carriesToken));
  }

  section('I. Runtime hygiene');
  {
    check('no uncaught page errors', pageErrors.length === 0, pageErrors.join(' | '));
    const expected = (line) => /status of (401|409)/.test(line);
    for (const line of consoleErrors) console.log(`    console.error ${expected(line) ? '(expected)' : '(UNEXPECTED)'}: ${line.slice(0, 160)}`);
    check('no unexpected console errors (only the deliberate 401/409 answers)', consoleErrors.filter((l) => !expected(l)).length === 0);
    const log = readFileSync(BACKEND_LOG, 'utf8');
    const errorLines = log.split('\n').filter((l) => l.includes('"level":"error"'));
    check('the backend logged no error-level line', errorLines.length === 0, errorLines.slice(0, 2).join(' | ').slice(0, 200));
    const leaked = [...minted, ...issued].filter((t) => log.includes(signatureOf(t)));
    check(`no ID token or issued access token appears in the backend log (${minted.length} + ${issued.length} checked)`, leaked.length === 0);
  }

  section('Not covered by this run');
  unverified('Google\'s real button, account chooser and consent screen', 'needs a real Google account in a browser on an authorized origin; only the production origin is authorized for the client id');
  unverified('A token signed by Google\'s real keys accepted end to end', 'this local process trusts only the simulated key by construction; the live check belongs to the production verification');

  await browser.close();
  console.log(`\nTOTAL: ${passes} PASS, ${failures} FAIL`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch(async (error) => {
  console.error('ABORTED:', error?.message ?? error);
  await browser?.close().catch(() => {});
  process.exit(1);
});
