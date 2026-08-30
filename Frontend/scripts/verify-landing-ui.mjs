/**
 * Real-browser proof of the public Landing screen.
 *
 * It is reached signed out, carries no authenticated chrome, and every control on it points at a
 * route this application really has. The dependency chart is example data and has to keep saying so.
 *
 *   npm run verify:landing-ui
 */
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';

/** Plural-as-neutral forms and slash forms. None may appear in the Hebrew copy. */
const FORBIDDEN_HE = ['בחרו', 'הזינו', 'מוכנים', 'שביקשתם', 'שהגעתם', 'ברצונכם', 'בחר/י', 'הזן/י', 'לכם', 'שלכם'];

/** Filenames the static prototype reserved. A React screen must never link to one. */
const STATIC_HREFS = ['.html', 'subscriptions', 'help', 'contact'];

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
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  section('1. The root address is the Landing screen, signed out');
  await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
  check('the URL stayed at the root — no redirect to Login', new URL(page.url()).pathname === '/', page.url());
  check('the hero headline is on screen', (await page.locator('#hero-title').count()) === 1);
  check('no access token is stored', (await page.evaluate(() => localStorage.getItem('fieldsync-access-token'))) === null);
  check('the tab title names the product', (await page.title()).includes('FieldSync'), await page.title());
  // The prototype's head carried this and the SPA shell does not, so the screen adds it itself.
  const description = await page.locator('meta[name="description"]').getAttribute('content');
  check('the approved meta description is present, verbatim',
    description === 'FieldSync — a coordination platform for construction professionals: assign work, link the tasks that depend on each other, and manage dates and changes in one place.',
    String(description));

  section('2. No authenticated chrome');
  check('the app navbar is absent', (await page.locator('.app-nav').count()) === 0);
  check('the public navbar is present instead', (await page.locator('.site-nav').count()) === 1);
  check('no notifications control', (await page.locator('.app-nav__bell, .bell').count()) === 0);
  check('no account chip or menu', (await page.locator('.account-menu, .app-nav__account').count()) === 0);
  const navText = await page.locator('.site-nav').innerText();
  check('the navbar never names a signed-in person',
    !/יציאה|התנתקות|הפרופיל שלי|Sign out|My profile/.test(navText), navText.replace(/\n/g, ' · '));

  section('3. Every destination is a real route');
  const hrefs = await page.$$eval('a[href]', (nodes) => nodes.map((n) => n.getAttribute('href')));
  check('no link points at a static prototype filename',
    !hrefs.some((h) => STATIC_HREFS.some((bad) => h.toLowerCase().includes(bad))), hrefs.join(' '));
  const internal = hrefs.filter((h) => h.startsWith('/'));
  check('only /register and /login are linked',
    internal.every((h) => h === '/register' || h === '/login'), internal.join(' '));
  check('Register is reachable from the navbar and the hero',
    (await page.locator('a[href="/register"]').count()) >= 2);

  for (const [label, href, expected] of [['Register', '/register', '/register'], ['Sign in', '/login', '/login']]) {
    await page.goto(`${APP}/`, { waitUntil: 'networkidle' });
    await page.locator(`a[href="${href}"]`).first().click();
    await page.waitForLoadState('networkidle');
    check(`${label} navigates to ${expected}`, new URL(page.url()).pathname === expected, page.url());
  }
  await page.goto(`${APP}/`, { waitUntil: 'networkidle' });

  section('4. The dependency visual stays an example');
  check('the chart is present', (await page.locator('.depviz__chart').count()) === 1);
  check('it draws four dependent rows', (await page.locator('.deprow').count()) === 4);
  check('each row carries both the original and the changed bar',
    (await page.locator('.depbar--was').count()) === 4 && (await page.locator('.depbar--now').count()) === 4);
  const caption = await page.locator('.depviz__note').innerText();
  check('the caption calls it example data, not a screenshot',
    caption.includes('נתוני דוגמה') && caption.includes('ולא צילום מסך'), caption.slice(0, 60));
  check('and it says the real dashboard screenshot replaces it later',
    caption.includes('לוח הפרויקט'), caption.slice(-60));
  check('the legend names both bar treatments in words',
    (await page.locator('.depviz__key').count()) === 2);

  section('5. Nothing confidential and nothing invented');
  const body = await page.locator('body').innerText();
  check('no delegation wording appears on a public page',
    !/האצלה|הואצל|delegat/i.test(body));
  check('no price, plan tier or quota is claimed',
    !/₪|\$|לחודש|per month|חינם|free trial/i.test(body));
  check('the footer states it is an academic prototype',
    (await page.locator('.site-foot__note').innerText()).includes('אב־טיפוס אקדמי'));

  section('6. Hebrew — default, RTL, singular');
  const he = await rootAttrs(page);
  check('the root is lang=he dir=rtl', he.lang === 'he' && he.dir === 'rtl', JSON.stringify(he));
  check('the computed direction really is rtl', he.direction === 'rtl', he.direction);
  const hits = FORBIDDEN_HE.filter((word) => body.includes(word));
  check('no plural-as-neutral or slash form in the copy', hits.length === 0, hits.join(','));
  check('the five flow steps are numbered', (await page.locator('.flow__step').count()) === 5);
  check('and the chevrons between them are decorative only',
    (await page.locator('.flow__arrow[aria-hidden="true"]').count()) === 4);

  section('7. English — LTR, and the whole page follows');
  await page.locator('.lang-switch__btn', { hasText: 'EN' }).click();
  await page.waitForTimeout(300);
  const en = await rootAttrs(page);
  check('the root flips to lang=en dir=ltr', en.lang === 'en' && en.dir === 'ltr', JSON.stringify(en));
  check('the computed direction really is ltr', en.direction === 'ltr', en.direction);
  const enBody = await page.locator('body').innerText();
  check('the hero headline is the English one',
    enBody.includes('Tasks, dates and dependencies'), enBody.slice(0, 60));
  // The language pill always shows both language names, on every screen, so it is not copy.
  const enCopy = await page.evaluate(() =>
    [...document.querySelectorAll('#main, .site-foot, .site-nav__brand')]
      .map((node) => node.innerText).join(' '));
  check('no Hebrew string is left behind outside the language pill',
    !/[֐-׿]/.test(enCopy), (enCopy.match(/[֐-׿]+/g) ?? []).join(','));
  check('the caption is the English one', (await page.locator('.depviz__note').innerText()).includes('not a product screenshot'));
  check('the English pill reads as the selected one',
    (await page.locator('.lang-switch__btn--active').innerText()) === 'EN');
  await page.locator('.lang-switch__btn', { hasText: 'עב' }).click();
  await page.waitForTimeout(300);
  check('switching back restores Hebrew RTL', (await rootAttrs(page)).dir === 'rtl');

  section('8. Responsive');
  for (const width of [1280, 1024, 860, 620, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    const over = await overflow(page);
    check(`no horizontal overflow at ${width}px`, over <= 0, String(over));
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.waitForTimeout(250);
  check('the hero call to action is still reachable at 390px',
    await page.locator('.hero__cta').isVisible());
  check('the chart is still on the page at 390px', (await page.locator('.deprow').count()) === 4);

  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
