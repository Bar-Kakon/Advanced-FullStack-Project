/**
 * Google Sign-In, end of the pre-merge investigation: the configuration chain, the server-side
 * verification path, the account-link surface that closes the LINK_REQUIRED dead end, and the
 * read-only production probes. The one step a machine cannot perform — a human choosing a Google
 * account — is reported honestly, never simulated.
 */
import './support/developmentGuard.mjs';
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5411';
const API = process.env.API_URL ?? 'http://localhost:4545/api';
const PROD_APP = 'https://blokta.vercel.app';
const PROD_API = 'https://blokta.onrender.com/api';
const SHOTS = process.env.SHOTS ?? '.';
const MONGO = process.env.MONGO_PORT ?? '27272';
const PASSWORD = 'CorrectHorse42!';
const stamp = Date.now();

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(88)} ${detail}`);
};
const info = (label, detail = '') => console.log(`  INFO  ${String(label).padEnd(88)} ${detail}`);
const section = (t) => console.log(`\n${t}`);
const mongo = (js) =>
  execSync(`mongosh --port ${MONGO} --quiet --eval '${js.replaceAll("'", `'\\''`)}'`).toString().trim();

const api = async (method, path, token, json, base = API) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      ...(json === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(json === undefined ? {} : { body: JSON.stringify(json) }),
  });
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  return { status: res.status, body };
};

const register = async (name, index) => {
  const email = `gl.${name}.${stamp}@example.com`;
  const reg = await api('POST', '/auth/register', undefined, {
    firstName: name, lastName: `G${index}`, standing: 'owner',
    companyName: `${name} GL Co ${stamp}`, contractorCategory: 'main_contractor',
    email, password: PASSWORD, confirmPassword: PASSWORD,
    registrationCategory: 'contractor', specialty: 'drilling',
    city: 'חיפה', region: 'haifa', availability: 'open',
    acceptedTerms: true, operationalEmail: true,
  });
  if (reg.status !== 201) throw new Error(`register ${name}: ${reg.status} ${JSON.stringify(reg.body)}`);
  const login = await api('POST', '/auth/login', undefined, { email, password: PASSWORD });
  return { email, token: login.body.accessToken, userId: login.body.user.id, name };
};

const pageAs = async (browser, fixture, lang = 'he') => {
  const me = await api('GET', '/auth/me', fixture.token);
  const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
  await ctx.addInitScript(([t2, u, l]) => {
    localStorage.setItem('fieldsync-access-token', t2);
    localStorage.setItem('fieldsync-user', u);
    localStorage.setItem('fieldsync-lang', l);
  }, [fixture.token, JSON.stringify(me.body.user), lang]);
  return ctx.newPage();
};

const gsiConsole = (page, sink) => {
  page.on('console', (m) => {
    const text = m.text();
    if (text.includes('GSI') || text.toLowerCase().includes('origin')) sink.push(`[${m.type()}] ${text}`);
  });
};

const run = async () => {
  const browser = await chromium.launch();

  section('0. Fixtures: two password accounts through the real register endpoint');
  const dana = await register('dana', 1);
  const noam = await register('noam', 2);
  console.log('  fixtures ready');

  section('1. The login screen consumes the configured client id (local, real id)');
  {
    const page = await browser.newPage();
    const gsi = [];
    gsiConsole(page, gsi);
    await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(4000);
    const host = await page.locator('.google-signin__host').count();
    const iframe = await page.locator('iframe[src*="accounts.google.com"]').count();
    check('the Google button host is on the login screen', host === 1, `hosts=${host}`);
    check('Google Identity Services rendered its button (script + id consumed)', iframe >= 1, `iframes=${iframe}`);
    const originTrouble = gsi.filter((l) => l.includes('not allowed'));
    if (originTrouble.length > 0) {
      info('localhost:5411 is NOT an authorized origin for this client id', originTrouble[0].slice(0, 90));
    } else {
      info('no GSI origin complaint on localhost:5411', gsi.length === 0 ? 'console clean' : gsi[0].slice(0, 90));
    }
    await page.screenshot({ path: `${SHOTS}/gl-login-local.png` });
    await page.close();
  }

  section('2. Server-side verification path refuses what it must (local, real audience)');
  {
    const bad = await api('POST', '/auth/google', undefined, { idToken: 'forged-token' });
    check('a forged credential on sign-in answers 401 INVALID_GOOGLE_CREDENTIAL',
      bad.status === 401 && bad.body?.code === 'INVALID_GOOGLE_CREDENTIAL', `status=${bad.status} code=${bad.body?.code}`);

    const missing = await api('POST', '/auth/google', undefined, {});
    check('a missing idToken is refused by validation', missing.status === 400, `status=${missing.status}`);

    const anon = await api('POST', '/auth/google/link', undefined, { idToken: 'forged-token' });
    check('link without a session is refused', anon.status === 401, `status=${anon.status}`);

    const badLink = await api('POST', '/auth/google/link', dana.token, { idToken: 'forged-token' });
    check('link with a forged credential answers 401 INVALID_GOOGLE_CREDENTIAL',
      badLink.status === 401 && badLink.body?.code === 'INVALID_GOOGLE_CREDENTIAL', `status=${badLink.status} code=${badLink.body?.code}`);
  }

  section('3. The LINK_REQUIRED dead end is closed: Settings now carries the link surface');
  {
    const settings = await api('GET', '/settings', dana.token);
    check('settings reports googleLinked=false for a password account',
      settings.status === 200 && settings.body?.settings?.googleLinked === false, `status=${settings.status} linked=${settings.body?.settings?.googleLinked}`);

    const page = await pageAs(browser, dana, 'he');
    await page.goto(`${APP}/settings`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    const title = await page.getByText('חשבון Google מקושר').count();
    const note = await page.getByText('קישור חשבון Google מאפשר התחברות עם Google').count();
    const host = await page.locator('.settings-google .google-signin__host').count();
    const iframe = await page.locator('.settings-google iframe[src*="accounts.google.com"]').count();
    check('UI (he): the account section carries the Google-link title', title === 1, `found=${title}`);
    check('UI (he): and explains what linking does', note === 1, `found=${note}`);
    check('UI (he): Google renders its real link button in Settings', host === 1 && iframe >= 1, `host=${host} iframe=${iframe}`);
    await page.screenshot({ path: `${SHOTS}/gl-settings-unlinked-he.png`, fullPage: true });
    await page.close();
  }

  section('4. A linked account is told so, and offered no second link');
  {
    mongo(`db.getSiblingDB('blokta-qa').users.updateOne({ email: '${dana.email}' }, { $set: { identities: [{ provider: 'google', subject: 'qa-subject-${stamp}', linkedAt: new Date() }] } })`);
    const settings = await api('GET', '/settings', dana.token);
    check('settings reports googleLinked=true once the identity exists',
      settings.body?.settings?.googleLinked === true, `linked=${settings.body?.settings?.googleLinked}`);

    const page = await pageAs(browser, dana, 'he');
    await page.goto(`${APP}/settings`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    const linkedNote = await page.getByText('החשבון מקושר ל-Google').count();
    const host = await page.locator('.settings-google .google-signin__host').count();
    check('UI (he): the linked state is stated in words', linkedNote === 1, `found=${linkedNote}`);
    check('UI (he): and the link button is gone', host === 0, `hosts=${host}`);
    await page.screenshot({ path: `${SHOTS}/gl-settings-linked-he.png`, fullPage: true });
    await page.close();
  }

  section('5. The same surface in English');
  {
    const page = await pageAs(browser, noam, 'en');
    await page.goto(`${APP}/settings`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    const title = await page.getByText('Linked Google account').count();
    const host = await page.locator('.settings-google .google-signin__host').count();
    check('UI (en): title and button present for an unlinked account', title === 1 && host === 1, `title=${title} host=${host}`);
    await page.screenshot({ path: `${SHOTS}/gl-settings-unlinked-en.png`, fullPage: true });
    await page.close();
  }

  section('6. Password authentication and its guards are untouched');
  {
    const login = await api('POST', '/auth/login', undefined, { email: noam.email, password: PASSWORD });
    check('password login still answers with a session', login.status === 200 && typeof login.body?.accessToken === 'string', `status=${login.status}`);

    const wrong = await api('POST', '/auth/login', undefined, { email: noam.email, password: 'Wrong1234!' });
    check('a wrong password is still refused', wrong.status === 401, `status=${wrong.status}`);

    let limited = false;
    for (let i = 0; i < 12 && !limited; i += 1) {
      const probe = await api('POST', '/auth/google', undefined, { idToken: `forged-${i}` });
      limited = probe.status === 429;
    }
    check('the Google sign-in rate limit still bites', limited, limited ? 'hit 429' : 'no 429 in 12 calls');
  }

  section('7. Production, read-only: the whole chain short of the human click');
  {
    const health = await fetch(`${PROD_API}/health`);
    check('Render backend is up', health.status === 200, `status=${health.status}`);

    const bad = await api('POST', '/auth/google', undefined, { idToken: 'forged-token' }, PROD_API);
    check('production refuses a forged credential as 401 INVALID_GOOGLE_CREDENTIAL (configured, not 503)',
      bad.status === 401 && bad.body?.code === 'INVALID_GOOGLE_CREDENTIAL', `status=${bad.status} code=${bad.body?.code}`);

    const index = await fetch(`${PROD_APP}/`);
    const html = await index.text();
    const asset = html.match(/assets\/index-[\w-]+\.js/)?.[0];
    const bundle = asset === undefined ? '' : await (await fetch(`${PROD_APP}/${asset}`)).text();
    check('the deployed bundle carries a Google client id (Vercel env baked into the build)',
      /\.apps\.googleusercontent\.com/.test(bundle), asset ?? 'bundle not found');

    const page = await browser.newPage();
    const gsi = [];
    gsiConsole(page, gsi);
    await page.goto(`${PROD_APP}/login`, { waitUntil: 'networkidle', timeout: 60000 });
    await page.waitForTimeout(5000);
    const iframe = await page.locator('iframe[src*="accounts.google.com"]').count();
    const originTrouble = gsi.filter((l) => l.includes('not allowed'));
    check('production login renders the Google button through GIS', iframe >= 1, `iframes=${iframe}`);
    check('no GSI origin complaint on https://blokta.vercel.app', originTrouble.length === 0,
      originTrouble[0]?.slice(0, 90) ?? 'console clean');

    let popupSeen = 'no popup event';
    try {
      const popup = page.waitForEvent('popup', { timeout: 8000 });
      await page.frameLocator('iframe[src*="accounts.google.com"]').locator('div[role="button"]').first().click({ timeout: 5000 });
      const opened = await popup;
      popupSeen = new URL(opened.url()).host;
    } catch { /* FedCM or click target variations; informative only */ }
    info('clicking the production button opens Google authentication', popupSeen);
    await page.screenshot({ path: `${SHOTS}/gl-prod-login-now.png` });
    await page.close();
  }

  section('8. What no machine may claim');
  info('a REAL Google round-trip (credential → Render → session → /dashboard) needs a human', 'UNVERIFIED until performed');

  await browser.close();
  console.log(failures === 0 ? '\nALL RUNNABLE CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error) => { console.error(error); process.exit(1); });
