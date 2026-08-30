/**
 * Real-browser proof of the 404 screen, and of the routing behind it.
 *
 * An unmatched address is answered, not redirected — signed out and signed in alike. The screen
 * says nothing about whether the thing asked for exists, and nothing about the address that failed.
 *
 *   npm run verify:404-ui
 */
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'CorrectHorse42!';

const stamp = Date.now();
const EMAIL = `notfound.${stamp}@example.com`;

/** Plural-as-neutral forms and slash forms. None may appear in the Hebrew copy. */
const FORBIDDEN_HE = ['שביקשתם', 'שהגעתם', 'בחרו', 'הזינו', 'ברצונכם', 'בחר/י', 'הזן/י', 'לכם', 'שלכם'];

/** Words that would disclose why the address failed, or what the viewer is allowed to see. */
const DISCLOSING = [
  'לא נמצא', 'אין הרשאה', 'הוסר', 'נמחק', 'פרטי', 'מוגבל',
  'forbidden', 'permission', 'unauthorized', 'deleted', 'removed', 'private', 'access denied',
  'stack', 'Error:', 'undefined', 'null', 'exception',
];

/** Addresses no route matches. Each has to land on the screen rather than anywhere else. */
const UNKNOWN = ['/nonsense', '/settings', '/projects/999999999999999999999999/nope', '/a/b/c/d'];

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(70)} ${detail}`);
};
const section = (t) => console.log(`\n${t}`);

const overflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const rootAttrs = (page) =>
  page.evaluate(() => ({
    dir: document.documentElement.dir,
    lang: document.documentElement.lang,
    direction: getComputedStyle(document.documentElement).direction,
  }));

const run = async () => {
  const registered = await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Not', lastName: 'Found', standing: 'owner',
      companyName: `NotFound ${stamp} Ltd`, email: EMAIL,
      password: PASSWORD, confirmPassword: PASSWORD,
      registrationCategory: 'contractor', specialty: 'electrical', city: 'חיפה', region: 'haifa',
      availability: 'open', acceptedTerms: true, operationalEmail: true,
    }),
  });
  if (registered.status !== 201) throw new Error(`register: ${registered.status}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  section('1. Signed out, an unknown address is answered rather than redirected');
  for (const path of UNKNOWN) {
    await page.goto(`${APP}${path}`, { waitUntil: 'networkidle' });
    const at = new URL(page.url()).pathname;
    check(`${path} stays put and renders the screen`,
      at === path && (await page.locator('.err__card').count()) === 1, at);
  }
  check('no session was created along the way',
    (await page.evaluate(() => localStorage.getItem('fieldsync-access-token'))) === null);
  check('the code is shown as 404', (await page.locator('.err__code').innerText()).trim() === '404');
  check('the tab title names the screen, not the address',
    (await page.title()).includes('FieldSync') && !(await page.title()).includes('nonsense'), await page.title());
  check('the page is marked noindex',
    (await page.locator('meta[name="robots"]').getAttribute('content')) === 'noindex');

  section('2. It discloses nothing');
  const body = await page.locator('body').innerText();
  const leaks = DISCLOSING.filter((word) => body.toLowerCase().includes(word.toLowerCase()));
  check('no wording says the resource was missing, removed or forbidden', leaks.length === 0, leaks.join(','));
  check('the failed address is nowhere on the screen',
    !body.includes('nonsense') && !body.includes('/a/b/c'), body.replace(/\n/g, ' · ').slice(0, 80));
  check('nothing names the viewer or their authorization state',
    !/Not Found|NotFound|owner|signed in|מחובר/i.test(body));
  check('three reasons, all phrased as possibilities',
    (await page.locator('.err__reasons-list li').count()) === 3);
  check('no uncaught page error', pageErrors.length === 0, pageErrors.join(' | '));

  section('3. One recovery action, and it fits a signed-out viewer');
  check('exactly one call to action', (await page.locator('.err__card a.btn').count()) === 1);
  check('the brand mark is deliberately not a link',
    (await page.locator('.err__brand a').count()) === 0);
  check('signed out, it points at the authentication boundary',
    (await page.locator('.err__cta').getAttribute('href')) === '/login');
  await page.locator('.err__cta').click();
  await page.waitForLoadState('networkidle');
  check('and it really lands on Login', new URL(page.url()).pathname === '/login', page.url());

  section('4. Hebrew — default, RTL, singular');
  await page.goto(`${APP}/nonsense`, { waitUntil: 'networkidle' });
  const he = await rootAttrs(page);
  check('the root is lang=he dir=rtl', he.lang === 'he' && he.dir === 'rtl', JSON.stringify(he));
  check('the computed direction really is rtl', he.direction === 'rtl', he.direction);
  const hits = FORBIDDEN_HE.filter((word) => body.includes(word));
  check('no plural-as-neutral and no slash form', hits.length === 0, hits.join(','));

  section('5. English — LTR, and the whole screen follows');
  await page.locator('.lang-switch__btn', { hasText: 'EN' }).click();
  await page.waitForTimeout(300);
  const en = await rootAttrs(page);
  check('the root flips to lang=en dir=ltr', en.lang === 'en' && en.dir === 'ltr', JSON.stringify(en));
  check('the computed direction really is ltr', en.direction === 'ltr', en.direction);
  const enTitle = await page.locator('.err__title').innerText();
  check('the headline is the English one', enTitle.includes("isn't available"), enTitle);
  check('the numeral is unchanged by language', (await page.locator('.err__code').innerText()).trim() === '404');
  const enBody = await page.evaluate(() => document.querySelector('.err__card').innerText);
  check('no Hebrew is left in the card', !/[֐-׿]/.test(enBody), (enBody.match(/[֐-׿]+/g) ?? []).join(','));
  await page.locator('.lang-switch__btn', { hasText: 'עב' }).click();
  await page.waitForTimeout(300);
  check('switching back restores Hebrew RTL', (await rootAttrs(page)).dir === 'rtl');

  section('6. Signed in, an unknown address is still the screen — never Login');
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  const token = await page.evaluate(() => localStorage.getItem('fieldsync-access-token'));
  check('the account is signed in', token !== null);

  for (const path of UNKNOWN) {
    await page.goto(`${APP}${path}`, { waitUntil: 'networkidle' });
    const at = new URL(page.url()).pathname;
    check(`${path} renders the screen and does not bounce to Login`,
      at === path && (await page.locator('.err__card').count()) === 1, at);
  }
  check('the session survived — nothing signed the viewer out',
    (await page.evaluate(() => localStorage.getItem('fieldsync-access-token'))) !== null);
  check('still no app navbar, even with a session', (await page.locator('.app-nav').count()) === 0);
  check('and still no account chip', (await page.locator('.nav-profile__name').count()) === 0);

  section('7. Signed in, the recovery action is that viewer’s home');
  // `destinationFor` is the app's one answer to "where does this session belong", so the CTA has
  // to be one of the three addresses it can produce — never a fourth this screen invented.
  const SESSION_HOMES = ['/dashboard', '/onboarding/employees', '/waiting-for-approval'];
  const href = await page.locator('.err__cta').getAttribute('href');
  check('it is no longer Login', href !== '/login', String(href));
  check('it is one of the addresses the session model resolves to',
    SESSION_HOMES.includes(String(href)), String(href));
  await page.locator('.err__cta').click();
  await page.waitForLoadState('networkidle');
  const landed = new URL(page.url()).pathname;
  check('and it lands exactly there, with no redirect', landed === href, `${href} -> ${landed}`);
  await page.goto(`${APP}/nonsense`, { waitUntil: 'networkidle' });
  check('returning to an unknown address does not loop either',
    new URL(page.url()).pathname === '/nonsense', page.url());

  section('8. Responsive');
  for (const width of [1280, 1024, 640, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    const over = await overflow(page);
    check(`no horizontal overflow at ${width}px`, over <= 0, String(over));
  }
  check('the recovery action is still reachable at 390px', await page.locator('.err__cta').isVisible());
  check('no uncaught page error over the whole run', pageErrors.length === 0, pageErrors.join(' | '));

  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
