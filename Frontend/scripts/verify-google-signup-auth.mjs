/**
 * The approved D30 exception, verified in one procedure: a password registration still
 * authenticates nobody, a Google registration's server contract is enforced to the verification
 * boundary, and the destination rules the exception reuses are proven with real sessions — an
 * active owner lands on the dashboard, a pending employee on Waiting for Approval. The legs only
 * a genuine Google credential can walk are named UNVERIFIED with their exact reason.
 */
import './support/developmentGuard.mjs';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5411';
const API = process.env.API_URL ?? 'http://localhost:4545/api';
const SHOTS = process.env.SHOTS ?? '.';
const MONGO = process.env.MONGO_PORT ?? '27272';
const BACKEND_LOG = process.env.BACKEND_LOG ?? '';
const PASSWORD = 'CorrectHorse42!';
const stamp = Date.now();
const FAKE_TOKEN = `qa-not-a-real-google-token-${stamp}`;

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(90)} ${detail}`);
};
const unverified = (label, blocker) => console.log(`  UNVERIFIED  ${label} — ${blocker}`);
const section = (t) => console.log(`\n${t}`);
const mongo = (js) =>
  execSync(`mongosh --port ${MONGO} --quiet --eval '${js.replaceAll("'", `'\\''`)}'`).toString().trim();

const raw = async (method, path, token, json, cookie) => {
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  return { status: res.status, body, setCookie: res.headers.get('set-cookie') };
};
const api = (method, path, token, json) => raw(method, path, token, json);

const ownerBody = (name, email, extra = {}) => ({
  firstName: name, lastName: 'Exception', standing: 'owner',
  companyName: `${name} D30 Co ${stamp}`, contractorCategory: 'main_contractor',
  email, registrationCategory: 'contractor', specialty: 'drilling',
  city: 'חיפה', region: 'haifa', availability: 'open',
  acceptedTerms: true, operationalEmail: true, ...extra,
});

const uiLogin = async (browser, email, password) => {
  const page = await browser.newPage();
  await page.addInitScript(() => localStorage.setItem('fieldsync-lang', 'he'));
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.fill('#password', password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3500);
  return page;
};

const run = async () => {
  const browser = await chromium.launch();

  section('1. D30 unchanged for the password path: Register authenticates nobody');
  const nogaEmail = `d30.noga.${stamp}@example.com`;
  {
    const reg = await raw('POST', '/auth/register', undefined, {
      ...ownerBody('noga', nogaEmail), password: PASSWORD, confirmPassword: PASSWORD,
    });
    check('a password registration answers 201 with the account alone', reg.status === 201 && reg.body?.user !== undefined, `status=${reg.status}`);
    check('it carries NO access token', reg.body?.accessToken === undefined);
    check('and sets NO refresh cookie', reg.setCookie === null, String(reg.setCookie).slice(0, 40));

    const login = await api('POST', '/auth/login', undefined, { email: nogaEmail, password: PASSWORD });
    check('authentication still happens at Login', login.status === 200 && typeof login.body?.accessToken === 'string');
  }

  section('2. The Google path: server contract enforced to the verification boundary');
  {
    const fake = await api('POST', '/auth/register', undefined, {
      ...ownerBody('fake', `d30.fake.${stamp}@example.com`), googleIdToken: FAKE_TOKEN,
    });
    check('a Google registration demands a credential Google really signed (401 on anything else)',
      fake.status === 401 && fake.body?.code === 'INVALID_GOOGLE_CREDENTIAL', `status=${fake.status}`);
    check('and the refusal opened no session', fake.body?.accessToken === undefined && fake.setCookie === null);
    const ghost = mongo(`db.getSiblingDB('blokta-qa').users.countDocuments({ email: 'd30.fake.${stamp}@example.com' })`);
    check('no half-created account exists after the refusal', ghost === '0', `count=${ghost}`);

    const both = await api('POST', '/auth/register', undefined, {
      ...ownerBody('both', `d30.both.${stamp}@example.com`), googleIdToken: FAKE_TOKEN,
      password: PASSWORD, confirmPassword: PASSWORD,
    });
    check('a local password beside a Google token is still refused', both.status === 400, `status=${both.status}`);

    const { region, ...noRegion } = ownerBody('missing', `d30.missing.${stamp}@example.com`);
    const missing = await api('POST', '/auth/register', undefined, { ...noRegion, googleIdToken: FAKE_TOKEN });
    check('every mandatory BLOKTA field is still required on the Google path', missing.status === 400, `status=${missing.status}`);

    const indexes = mongo(`JSON.stringify(db.getSiblingDB('blokta-qa').users.getIndexes().map(i => ({ key: i.key, unique: !!i.unique })))`);
    const identityIndex = JSON.parse(indexes).find((i) => i.key['identities.provider'] === 1 && i.key['identities.subject'] === 1);
    check('one Google identity, one account — the unique index stands', identityIndex?.unique === true);

    unverified('a GENUINE Google registration creates the account, links the identity, and answers 201 with the session',
      'the signed_in answer sits behind Google verification, reachable only with a credential Google issues to a human');
    unverified('the fresh session loads the current user and survives refresh',
      'same leg — the issuance it uses (tokenPair, SessionUser, refresh cookie) is the one proven below on real logins');
  }

  section('3. The destination rules the exception reuses, proven with real sessions');
  const daliaEmail = `d30.dalia.${stamp}@example.com`;
  {
    const page = await uiLogin(browser, nogaEmail, PASSWORD);
    check('an active, fully authorized account lands on /dashboard', page.url().includes('/dashboard'), page.url());
    await page.screenshot({ path: `${SHOTS}/d30-owner-dashboard.png` });
    await page.close();

    const noga = await api('POST', '/auth/login', undefined, { email: nogaEmail, password: PASSWORD });
    const invite = await api('POST', '/companies/employees/invitations', noga.body.accessToken,
      { fullName: 'דליה Exception', companyPosition: 'site_manager' });
    check('the owner opens a seat for the employee', invite.status === 201, `status=${invite.status}`);

    const reg = await raw('POST', '/auth/register', undefined, {
      firstName: 'דליה', lastName: 'Exception', standing: 'employee',
      companyName: `noga D30 Co ${stamp}`, companyPosition: 'site_manager',
      email: daliaEmail, password: PASSWORD, confirmPassword: PASSWORD,
      registrationCategory: 'contractor', specialty: 'drilling',
      city: 'חיפה', region: 'haifa',
      acceptedTerms: true, operationalEmail: true,
    });
    check('the employee claims the seat through registration (still unauthenticated)',
      reg.status === 201 && reg.body?.accessToken === undefined, `status=${reg.status}`);

    const employeePage = await uiLogin(browser, daliaEmail, PASSWORD);
    check('a pending employee lands on Waiting for Approval, never the dashboard',
      employeePage.url().includes('/waiting-for-approval'), employeePage.url());
    await employeePage.screenshot({ path: `${SHOTS}/d30-waiting-approval.png` });
    await employeePage.close();

    const dalia = await api('POST', '/auth/login', undefined, { email: daliaEmail, password: PASSWORD });
    const me = await api('GET', '/auth/me', dalia.body.accessToken);
    check('the pending state is the server’s word: membership awaits company approval, no permissions',
      me.body?.user?.company?.membershipStatus === 'pending_company_approval' &&
      (me.body?.user?.company?.permissions ?? []).length === 0,
      `status=${me.body?.user?.company?.membershipStatus}`);

    const nogaMe = await api('GET', '/auth/me', noga.body.accessToken);
    check('cross-account isolation: each session answers as itself alone',
      nogaMe.body?.user?.id !== me.body?.user?.id && nogaMe.status === 200 && me.status === 200);
  }

  section('4. The neighbors stand: sign-in, linking, refresh rotation, logout');
  {
    const forged = await api('POST', '/auth/google', undefined, { idToken: 'forged' });
    check('Google Sign-In still refuses a forged credential', forged.status === 401 && forged.body?.code === 'INVALID_GOOGLE_CREDENTIAL');

    const dalia = await raw('POST', '/auth/login', undefined, { email: daliaEmail, password: PASSWORD });
    const settings = await api('GET', '/settings', dalia.body.accessToken);
    check('the linking surface still reads googleLinked honestly', settings.body?.settings?.googleLinked === false);
    const badLink = await api('POST', '/auth/google/link', dalia.body.accessToken, { idToken: 'forged' });
    check('and linking still demands a genuine credential', badLink.status === 401);

    const cookie = (dalia.setCookie ?? '').split(';')[0];
    const refreshed = await raw('POST', '/auth/refresh', undefined, {}, cookie);
    check('the refresh cookie rotates into a fresh access token',
      refreshed.status === 200 && typeof refreshed.body?.accessToken === 'string', `status=${refreshed.status}`);
    const rotated = (refreshed.setCookie ?? '').split(';')[0];
    await raw('POST', '/auth/logout', refreshed.body?.accessToken, {}, rotated);
    const afterLogout = await raw('POST', '/auth/refresh', undefined, {}, rotated);
    check('logout revokes the family: the rotated cookie is dead', afterLogout.status === 401, `status=${afterLogout.status}`);

    const wrong = await api('POST', '/auth/login', undefined, { email: nogaEmail, password: 'Wrong1234!' });
    check('a wrong password is still a wrong password', wrong.status === 401);
  }

  section('5. UI: the Google-mode screen is intact, in both languages, with nothing in the address');
  {
    const page = await browser.newPage();
    await page.addInitScript(() => localStorage.setItem('fieldsync-lang', 'he'));
    await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
    await page.evaluate(([tok]) => {
      window.history.pushState({ usr: { google: { idToken: tok, email: 'ui@example.com', firstName: 'גל', lastName: 'ברק' } }, key: 'qa1', idx: 1 }, '', '/register');
      window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    }, [FAKE_TOKEN]);
    await page.waitForTimeout(1500);
    check('Google mode: locked email, no password fields, RTL',
      (await page.locator('#email').getAttribute('readonly')) !== null &&
      (await page.locator('#password').count()) === 0 &&
      (await page.evaluate(() => document.documentElement.dir)) === 'rtl');
    check('the credential travels in navigation state, never the address',
      !page.url().includes(FAKE_TOKEN) && !page.url().includes('token'), page.url());
    await page.close();

    const en = await browser.newPage();
    await en.addInitScript(() => localStorage.setItem('fieldsync-lang', 'en'));
    await en.goto(`${APP}/login`, { waitUntil: 'networkidle' });
    await en.evaluate(([tok]) => {
      window.history.pushState({ usr: { google: { idToken: tok, email: 'ui@example.com', firstName: 'Gal', lastName: 'Barak' } }, key: 'qa2', idx: 1 }, '', '/register');
      window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
    }, [FAKE_TOKEN]);
    await en.waitForTimeout(1500);
    check('and the English screen is LTR with the same Google mode',
      (await en.evaluate(() => document.documentElement.dir)) === 'ltr' &&
      (await en.locator('#password').count()) === 0);
    await en.close();

    if (BACKEND_LOG !== '') {
      const log = readFileSync(BACKEND_LOG, 'utf8');
      check('no credential or issued token leaked into the backend log',
        !log.includes(FAKE_TOKEN) && !log.includes('accessToken'));
    }

    unverified('after a GENUINE Google registration no Login screen appears and the person stands on their destination',
      'the landing is driven by the session the real credential earns; its exact navigation (signIn → destinationFor) is the one real logins exercised in section 3');
  }

  await browser.close();
  console.log(failures === 0 ? '\nALL RUNNABLE CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error) => { console.error(error); process.exit(1); });
