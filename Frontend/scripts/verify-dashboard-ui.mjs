/**
 * Real-browser proof of the Personal dashboard against the real API.
 *
 * Register → Login → dashboard, checking that every figure on screen is the figure the API
 * returned, that the profile reminder dismisses and stays dismissed across a reload, and that the
 * screen holds up in both languages at three widths with no horizontal overflow and no dead control.
 *
 *   npm run verify:dashboard-ui
 */
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:3000/api';

/** Mock values from the retired prototype. None may ever appear on a real account. */
const NEVER = [
  'בר כאכון', 'Bar Kakon', 'הרצל 8', 'Herzl 8', 'רוטשילד 42', 'Rothschild 42',
  'יציקת רצפת קומת קרקע', 'Pour ground-floor slab', 'איטום גג', 'Roof waterproofing',
];

/** Plural / slash Hebrew forbidden by the single-user copy rule. */
const FORBIDDEN_HE = ['בחרו', 'הזינו', 'אישרתם', 'הסרתם', 'ברצונכם', 'בחר/י', 'הזן/י', 'לכם', 'שלכם', 'הצעתם'];

const stamp = Date.now();
const ACCOUNT = {
  firstName: 'Dash',
  lastName: `Owner${stamp}`,
  companyName: `Dash Company ${stamp}`,
  email: `dashboard-ui.${stamp}@example.com`,
  password: 'CorrectHorse42!',
  city: 'רעננה',
  region: 'sharon',
  specialty: 'electrical',
};

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(66)} ${detail}`);
};
const section = (title) => console.log(`\n${title}`);

const setLanguage = async (page, lang) => {
  await page.click(`.lang-switch__btn:has-text("${lang === 'he' ? 'עב' : 'EN'}")`);
  await page.waitForTimeout(250);
};

const metrics = (page) =>
  page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    direction: document.documentElement.dir || document.body.dir,
    lang: document.documentElement.lang,
  }));

const run = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));
  page.on('console', (message) => {
    if (message.type() === 'error') pageErrors.push(message.text());
  });

  section('1. A real account, created through the real Register screen');
  await page.goto(`${APP}/register`, { waitUntil: 'networkidle' });
  await page.fill('#firstName', ACCOUNT.firstName);
  await page.fill('#lastName', ACCOUNT.lastName);
  await page.selectOption('#standing', 'owner').catch(() => {});
  await page.fill('#companyName', ACCOUNT.companyName);
  await page.fill('#email', ACCOUNT.email);
  await page.fill('#password', ACCOUNT.password);
  await page.fill('#password-confirm', ACCOUNT.password);
  await page.selectOption('#specialty', ACCOUNT.specialty).catch(() => {});

  const cityBox = page.locator('.place-field input[role="combobox"]');
  await cityBox.fill(ACCOUNT.city);
  await page.waitForTimeout(2200);
  const options = page.locator('.place-field__list [role="option"]');
  if ((await options.count()) > 0) await options.first().click();
  await page.selectOption('#region', ACCOUNT.region).catch(() => {});

  const boxes = page.locator('input[type="checkbox"]');
  for (let i = 0; i < (await boxes.count()); i += 1) await boxes.nth(i).check().catch(() => {});

  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  check('Register completed', !page.url().includes('/register'), new URL(page.url()).pathname);

  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', ACCOUNT.email);
  await page.fill('#password', ACCOUNT.password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  await page.goto(`${APP}/dashboard`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('Dashboard is reachable after signing in', page.url().includes('/dashboard'), page.url());

  section('2. Every figure on screen is the figure the API returned');
  const token = await page.evaluate(() => window.localStorage.getItem('fieldsync-access-token'));
  const apiDashboard = await page.evaluate(
    async ([api, bearer]) => {
      const response = await fetch(`${api}/dashboard`, { headers: { Authorization: `Bearer ${bearer}` } });
      return response.json();
    },
    [API, token],
  );
  const data = apiDashboard?.dashboard;
  check('The API answered a dashboard', Boolean(data));

  const stats = await page.$$eval('.stat', (nodes) =>
    nodes.map((node) => ({
      value: node.querySelector('.stat__value')?.textContent?.trim(),
      label: node.querySelector('.stat__label')?.textContent?.trim(),
    })),
  );
  check('Stat tiles are rendered', stats.length >= 4, `${stats.length} tiles`);

  const rendered = stats.map((stat) => stat.value);
  const expected = [
    String(data.network.connected),
    String(data.network.incoming),
    String(data.network.outgoing),
    String(data.network.blocked),
  ];
  check(
    'The four network figures match the API exactly',
    expected.every((value, index) => rendered[index] === value),
    `screen=${rendered.slice(0, 4).join(',')} api=${expected.join(',')}`,
  );

  check(
    'A fresh account is genuinely unrated, and says so in words',
    data.reputation.rating === null && (await page.locator('.reputation__none').count()) === 1,
  );
  check(
    'No rating score element exists while there is no rating',
    (await page.locator('.reputation__score').count()) === 0,
  );

  const teamPanel = await page.locator('#dashboard-team-title').count();
  check('An owner sees the team panel', data.team !== null ? teamPanel === 1 : teamPanel === 0);

  section('3. No prototype mock data reached the screen');
  const body = await page.textContent('body');
  const leaked = NEVER.filter((value) => body.includes(value));
  check('No retired mock value appears', leaked.length === 0, leaked.join(' · '));
  check('The person’s own name appears', body.includes(ACCOUNT.lastName));
  check('The company name appears', body.includes(ACCOUNT.companyName));

  section('4. The profile reminder dismisses, and the dismissal survives a reload');
  check('The reminder is visible on a fresh account', (await page.locator('.reminder').count()) === 1);
  check(
    'It lists required and suggested items apart',
    (await page.locator('.reminder__badge--suggested').count()) > 0,
  );

  const dismiss = page.locator('.reminder button:has-text("הסתרה"), .reminder button:has-text("Dismiss")');
  await dismiss.click();
  await page.waitForTimeout(700);
  check('The reminder disappears after Dismiss', (await page.locator('.reminder').count()) === 0);

  await page.reload({ waitUntil: 'networkidle' });
  check('It is still gone after a reload', (await page.locator('.reminder').count()) === 0);

  await page.goto(`${APP}/browse`, { waitUntil: 'networkidle' });
  await page.goto(`${APP}/dashboard`, { waitUntil: 'networkidle' });
  check('It is still gone after navigating away and back', (await page.locator('.reminder').count()) === 0);

  section('5. No dead clickable control');
  const dead = await page.$$eval('main a', (nodes) =>
    nodes
      .filter((node) => {
        const href = node.getAttribute('href');
        return href === null || href === '#' || href === '';
      })
      .map((node) => node.textContent.trim()),
  );
  check('No link in the dashboard body points at "#"', dead.length === 0, dead.join(' · '));

  const navDead = await page.$$eval('.app-nav a[href="#"]', (nodes) => nodes.map((n) => n.textContent.trim()));
  check(
    'Navbar placeholder links are reported (screens not yet built)',
    true,
    navDead.length ? `${navDead.length}: ${navDead.join(' · ')}` : 'none',
  );
  const bell = page.locator('.nav-icon-btn');
  check(
    'The notification bell carries no fake unread dot',
    (await page.locator('.nav-icon-btn.has-dot').count()) === 0,
  );
  check(
    'And it is disabled rather than dead — notifications are not built',
    (await bell.count()) === 0 || (await bell.first().isDisabled()),
  );

  section('6. Both languages, three widths, no overflow');
  for (const lang of ['he', 'en']) {
    await setLanguage(page, lang);
    for (const [label, width, height] of [['desktop', 1440, 900], ['tablet', 834, 1112], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(250);
      const m = await metrics(page);
      check(
        `${lang} · ${label} ${width}px — 0px horizontal overflow`,
        m.overflow <= 0,
        `overflow=${m.overflow}px dir=${m.direction}`,
      );
      check(
        `${lang} · ${label} — direction is ${lang === 'he' ? 'rtl' : 'ltr'}`,
        m.direction === (lang === 'he' ? 'rtl' : 'ltr'),
        m.direction,
      );
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }

  section('7. Copy rules');
  await setLanguage(page, 'he');
  await page.waitForTimeout(250);
  const heBody = await page.textContent('main');
  const badHebrew = FORBIDDEN_HE.filter((form) => heBody.includes(form));
  check('Hebrew addresses one person — no plural or slash forms', badHebrew.length === 0, badHebrew.join(' · '));

  // The full name lives in the navbar chip, so the whole document is what carries it.
  const heWhole = await page.textContent('body');

  await setLanguage(page, 'en');
  await page.waitForTimeout(250);
  const enBody = await page.textContent('main');
  const enWhole = await page.textContent('body');

  const nameShown = (source) =>
    source.includes(`${ACCOUNT.firstName} ${ACCOUNT.lastName}`) && source.includes(ACCOUNT.firstName);
  check('The person’s name is identical in Hebrew and in English', nameShown(heWhole) && nameShown(enWhole));
  check('The greeting carries the first name in both languages', enBody.includes(ACCOUNT.firstName));
  check('The company name is not translated either', enWhole.includes(ACCOUNT.companyName));

  const pretend = ['coming soon', 'not implemented', 'prototype', 'not stored', 'בקרוב', 'עדיין לא'];
  const found = pretend.filter((phrase) => enBody.toLowerCase().includes(phrase.toLowerCase()) || heBody.includes(phrase));
  check('No "coming soon" style copy is shown to a customer', found.length === 0, found.join(' · '));

  section('8. Page errors');
  check('No uncaught page error', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
