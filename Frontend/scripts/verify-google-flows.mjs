/**
 * The three Google authentication flows, verified in one procedure against the real stack:
 * Sign-In (A) to its machine-verifiable boundary, Sign-Up (B) through the real Google-mode
 * registration screen with the server's real refusal of a non-genuine credential, and Linking (C)
 * through the Settings surface. Every leg that requires a credential only Google can issue is
 * named UNVERIFIED with its exact blocker, never simulated into a pass.
 */
import { execSync } from 'node:child_process';
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5411';
const API = process.env.API_URL ?? 'http://localhost:4545/api';
const SHOTS = process.env.SHOTS ?? '.';
const MONGO = process.env.MONGO_PORT ?? '27272';
const PASSWORD = 'CorrectHorse42!';
const stamp = Date.now();

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(90)} ${detail}`);
};
const unverified = (label, blocker) => console.log(`  UNVERIFIED  ${label} — ${blocker}`);
const section = (t) => console.log(`\n${t}`);
const mongo = (js) =>
  execSync(`mongosh --port ${MONGO} --quiet --eval '${js.replaceAll("'", `'\\''`)}'`).toString().trim();

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
  try { body = await res.json(); } catch { /* empty */ }
  return { status: res.status, body };
};

const ownerBody = (name, email, extra = {}) => ({
  firstName: name, lastName: 'Flows', standing: 'owner',
  companyName: `${name} Flows Co ${stamp}`, contractorCategory: 'main_contractor',
  email, registrationCategory: 'contractor', specialty: 'drilling',
  city: 'חיפה', region: 'haifa', availability: 'open',
  acceptedTerms: true, operationalEmail: true, ...extra,
});

const register = async (name) => {
  const email = `gf.${name}.${stamp}@example.com`;
  const reg = await api('POST', '/auth/register', undefined, {
    ...ownerBody(name, email), password: PASSWORD, confirmPassword: PASSWORD,
  });
  if (reg.status !== 201) throw new Error(`register ${name}: ${reg.status} ${JSON.stringify(reg.body)}`);
  const login = await api('POST', '/auth/login', undefined, { email, password: PASSWORD });
  return { email, token: login.body.accessToken, userId: login.body.user.id, name };
};

/** Arrives somewhere carrying router state, the way navigate(path, { state }) does. */
const gotoWithState = async (page, path, state, lang = 'he') => {
  await page.addInitScript((l) => localStorage.setItem('fieldsync-lang', l), lang);
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.evaluate(([p, st]) => {
    window.history.pushState({ usr: st, key: `qa${Date.now()}`, idx: 1 }, '', p);
    window.dispatchEvent(new PopStateEvent('popstate', { state: window.history.state }));
  }, [path, state]);
  await page.waitForTimeout(1500);
};

const googleState = (email) => ({
  google: { idToken: `qa-not-a-real-google-token-${stamp}`, email, firstName: 'גל', lastName: 'ברק' },
});

const run = async () => {
  const browser = await chromium.launch();

  section('0. Fixtures: two password accounts through the real register endpoint');
  const alon = await register('alon');
  const rina = await register('rina');
  console.log('  fixtures ready');

  section('FLOW A — Google Sign-In, to the machine-verifiable boundary');
  {
    const forged = await api('POST', '/auth/google', undefined, { idToken: 'forged' });
    check('a non-genuine credential is refused 401 INVALID_GOOGLE_CREDENTIAL',
      forged.status === 401 && forged.body?.code === 'INVALID_GOOGLE_CREDENTIAL', `status=${forged.status}`);

    const indexes = mongo(`JSON.stringify(db.getSiblingDB('blokta-qa').users.getIndexes().map(i => ({ key: i.key, unique: !!i.unique })))`);
    const identityIndex = JSON.parse(indexes).find((i) => i.key['identities.provider'] === 1 && i.key['identities.subject'] === 1);
    check('one Google identity can only ever belong to one account (unique index in the database)',
      identityIndex !== undefined && identityIndex.unique === true, identityIndex === undefined ? indexes.slice(0, 120) : 'unique=true');

    const login = await api('POST', '/auth/login', undefined, { email: alon.email, password: PASSWORD });
    check('password login is untouched beside the Google path', login.status === 200, `status=${login.status}`);
    const wrong = await api('POST', '/auth/login', undefined, { email: alon.email, password: 'Wrong1234!' });
    check('and still refuses a wrong password', wrong.status === 401, `status=${wrong.status}`);

    unverified('an existing LINKED account authenticates and lands on /dashboard',
      'requires a credential only Google issues to a human; the identical pipeline is proven to the verification boundary');
    unverified('a deactivated linked account is refused a Google session',
      'same blocker — the status rule (isSessionPermitted) is the one password login already enforces');
  }

  section('FLOW B — Google Sign-Up: the real Google-mode registration screen (he, RTL)');
  {
    const page = await browser.newPage();
    const gbEmail = `gb.user.${stamp}@example.com`;
    await gotoWithState(page, '/register', googleState(gbEmail));

    check('the Google-mode register screen opened via router state', page.url().includes('/register'), page.url());
    check('UI is RTL in Hebrew', (await page.evaluate(() => document.documentElement.dir)) === 'rtl');

    const notice = await page.locator('.form-note--google').first().textContent().catch(() => '');
    check('the screen says this registration completes a verified Google identity',
      (notice ?? '').includes('Google') && (notice ?? '').includes(gbEmail), (notice ?? '').slice(0, 60));

    check('the verified email is prefilled and NOT editable',
      (await page.locator('#email').inputValue()) === gbEmail &&
      (await page.locator('#email').getAttribute('readonly')) !== null);
    check('the locked email explains itself',
      (await page.getByText('הכתובת מגיעה מחשבון ה-Google').count()) === 1);
    check('Google-provided names are prefilled, editable for correction',
      (await page.locator('#firstName').inputValue()) === 'גל' &&
      (await page.locator('#firstName').getAttribute('readonly')) === null);
    check('there are NO password fields in Google mode',
      (await page.locator('#password').count()) === 0 && (await page.locator('#password-confirm').count()) === 0);
    check('instead the screen says the account opens with no password and signs in with Google',
      (await page.getByText('החשבון ייפתח ללא סיסמה').count()) === 1);
    await page.screenshot({ path: `${SHOTS}/gf-register-google-he.png`, fullPage: true });

    await page.selectOption('#registrationCategory', 'supplier');
    await page.selectOption('#specialty', 'stone_supplier');
    await page.fill('#companyName', `GB Flows Co ${stamp}`);
    if ((await page.locator('input#city').count()) === 1) {
      await page.fill('input#city', 'חיפה');
    } else {
      const cityBox = page.locator('.place-field input[role="combobox"]');
      const opts = page.locator('.place-field__list [role="option"]');
      for (let attempt = 0; attempt < 4 && (await opts.count()) === 0; attempt += 1) {
        await cityBox.fill('');
        await cityBox.type('חיפה', { delay: 60 });
        await page.waitForTimeout(2500);
      }
      if (await opts.count()) await opts.first().click();
    }
    await page.selectOption('#region', 'haifa').catch(() => {});
    await page.waitForTimeout(400);
    check('the step button accepts the form with no password entered',
      await page.locator('#register-next').isEnabled());
    await page.click('#register-next');
    await page.waitForTimeout(600);

    await page.locator('#operationalEmail-decline').check();
    await page.locator('input[name="acceptedTerms"]').check();
    const submit = page.locator('.reg-nav button[type="submit"]');
    check('the Google-mode submit is named as a completion', (await submit.textContent())?.includes('סיום ההרשמה') === true);

    const [response] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/auth/register'), { timeout: 20000 }),
      submit.click(),
    ]);
    const body = await response.json().catch(() => null);
    check('the server re-verifies the credential itself and refuses a non-genuine one',
      response.status() === 401 && body?.code === 'INVALID_GOOGLE_CREDENTIAL', `status=${response.status()} code=${body?.code}`);
    await page.waitForTimeout(800);
    check('the refusal reaches the person as a rendered message, not silence',
      (await page.locator('.form-alert, [role="alert"]').count()) >= 1);
    await page.screenshot({ path: `${SHOTS}/gf-register-google-refusal.png` });
    await page.close();

    unverified('completing Google Sign-Up creates the passwordless linked account',
      'the same submit with a genuine credential; every rule after verification is existing registration code');
  }

  section('FLOW B — the server-side contract, directly');
  {
    const both = await api('POST', '/auth/register', undefined, {
      ...ownerBody('dup', `gb.dup.${stamp}@example.com`),
      googleIdToken: 'qa-fake', password: PASSWORD, confirmPassword: PASSWORD,
    });
    check('a password alongside a Google token is refused outright (no password nobody chose)',
      both.status === 400, `status=${both.status}`);

    const fake = await api('POST', '/auth/register', undefined, {
      ...ownerBody('fake', `gb.fake.${stamp}@example.com`), googleIdToken: 'qa-fake',
    });
    check('a Google registration with a non-genuine token dies at verification, creating nothing',
      fake.status === 401 && fake.body?.code === 'INVALID_GOOGLE_CREDENTIAL', `status=${fake.status}`);
    const ghost = mongo(`db.getSiblingDB('blokta-qa').users.countDocuments({ email: 'gb.fake.${stamp}@example.com' })`);
    check('no half-created account exists after the refusal', ghost === '0', `count=${ghost}`);

    unverified('GOOGLE_EMAIL_MISMATCH / GOOGLE_IDENTITY_CLAIMED / GOOGLE_EMAIL_NOT_VERIFIED refusals on live tokens',
      'each sits after Google verification, reachable only with a genuine credential');
  }

  section('FLOW B — after creation: Register authenticates nobody (D30), and Login says what to do');
  {
    const page = await browser.newPage();
    await gotoWithState(page, '/login', { googleRegistered: true });
    const note = await page.locator('.form-note--google').first().textContent().catch(() => '');
    check('Login greets a Google registrant: created, no password, continue with Google',
      (note ?? '').includes('ללא סיסמה') && (note ?? '').includes('Google'), (note ?? '').slice(0, 70));
    check('the Google button is right there on the same screen',
      (await page.locator('.google-signin__host').count()) === 1);
    await page.screenshot({ path: `${SHOTS}/gf-login-after-google-register.png` });
    await page.close();

    const plain = await browser.newPage();
    await plain.goto(`${APP}/login`, { waitUntil: 'networkidle' });
    check('an ordinary Login arrival sees no such note',
      (await plain.locator('.form-note--google').count()) === 0);
    await plain.close();
  }

  section('FLOW C — Linking, through the real Settings surface');
  {
    const settings = await api('GET', '/settings', alon.token);
    check('an unlinked password account reads googleLinked=false', settings.body?.settings?.googleLinked === false);

    const anon = await api('POST', '/auth/google/link', undefined, { idToken: 'forged' });
    check('linking without a session is refused', anon.status === 401, `status=${anon.status}`);
    const forged = await api('POST', '/auth/google/link', alon.token, { idToken: 'forged' });
    check('linking with a non-genuine credential is refused 401',
      forged.status === 401 && forged.body?.code === 'INVALID_GOOGLE_CREDENTIAL');

    const me = await api('GET', '/auth/me', alon.token);
    const ctx = await browser.newContext({ viewport: { width: 1360, height: 900 } });
    await ctx.addInitScript(([t2, u]) => {
      localStorage.setItem('fieldsync-access-token', t2);
      localStorage.setItem('fieldsync-user', u);
    }, [alon.token, JSON.stringify(me.body.user)]);
    const page = await ctx.newPage();
    await page.goto(`${APP}/settings`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3500);
    check('Settings offers the Google link with its explanation',
      (await page.getByText('חשבון Google מקושר').count()) === 1 &&
      (await page.locator('.settings-google .google-signin__host').count()) === 1);

    mongo(`db.getSiblingDB('blokta-qa').users.updateOne({ email: '${alon.email}' }, { $set: { identities: [{ provider: 'google', subject: 'qa-sub-${stamp}', linkedAt: new Date() }] } })`);
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2500);
    check('a linked account is told so in words and offered no second link',
      (await page.getByText('החשבון מקושר ל-Google').count()) === 1 &&
      (await page.locator('.settings-google .google-signin__host').count()) === 0);
    await page.screenshot({ path: `${SHOTS}/gf-settings-linked.png`, fullPage: true });
    await page.close();
    await ctx.close();

    const after = await api('GET', '/auth/me', alon.token);
    check('linking changed no session, membership or permission — the same session still answers',
      after.status === 200 && after.body?.user?.id === alon.userId);

    unverified('the real link click and the subsequent Google Sign-In into the same account',
      'both need a genuine credential; the route, guard and storage they use are exercised above');
    unverified('a second account claiming an already-linked Google identity is refused GOOGLE_IDENTITY_CLAIMED',
      'reachable only with a genuine credential; a duplicate is refused regardless by the unique index proven in Flow A');
  }

  section('UI — English LTR and phone width');
  {
    const page = await browser.newPage();
    const gbEmail = `gb.en.${stamp}@example.com`;
    await gotoWithState(page, '/register', googleState(gbEmail), 'en');
    check('UI is LTR in English', (await page.evaluate(() => document.documentElement.dir)) === 'ltr');
    const notice = await page.locator('.form-note--google').first().textContent().catch(() => '');
    check('the English Google notice names the verified address', (notice ?? '').includes(gbEmail), (notice ?? '').slice(0, 60));
    await page.screenshot({ path: `${SHOTS}/gf-register-google-en.png`, fullPage: true });
    await page.close();

    const phone = await browser.newPage();
    await phone.setViewportSize({ width: 390, height: 844 });
    await gotoWithState(phone, '/register', googleState(`gb.mob.${stamp}@example.com`));
    const overflow = await phone.evaluate(() => {
      const el = document.scrollingElement;
      return el.scrollWidth - el.clientWidth;
    });
    check('no horizontal overflow at phone width in Google mode', overflow <= 1, `overflowPx=${overflow}`);
    await phone.screenshot({ path: `${SHOTS}/gf-register-google-mobile.png`, fullPage: true });
    await phone.close();

    const rina2 = await api('GET', '/auth/me', rina.token);
    check('the second fixture still has its own untouched account (cross-account isolation)',
      rina2.status === 200 && rina2.body?.user?.id === rina.userId);
  }

  await browser.close();
  console.log(failures === 0 ? '\nALL RUNNABLE CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error) => { console.error(error); process.exit(1); });
