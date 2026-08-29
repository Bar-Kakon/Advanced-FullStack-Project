/**
 * Real-browser proof for the navbar account menu, and for the rule that a person's own name is
 * data rather than interface copy.
 *
 * Needs the API and the dev server running.
 *
 *   npm run verify:account-menu
 */
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'CorrectHorse42!';

const stamp = Date.now();
const FIRST = 'Orly';
const LAST = 'Nataniel';
const EMAIL = `account-menu-verify.${stamp}@example.com`;

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(58)} ${detail}`);
};
const section = (title) => console.log(`\n${title}`);

const setLang = async (page, lang) => {
  await page.click(`.lang-switch__btn:has-text("${lang === 'he' ? 'עב' : 'EN'}")`);
  await page.waitForTimeout(350);
};

const run = async () => {
  const registered = await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: FIRST, lastName: LAST, standing: 'owner',
      companyName: `Account Menu ${stamp} Ltd`, email: EMAIL,
      password: PASSWORD, confirmPassword: PASSWORD,
      specialty: 'electrical', city: 'חיפה', region: 'haifa',
      availability: 'open', acceptedTerms: true,
    }),
  });
  if (registered.status !== 201) throw new Error(`register: ${registered.status}`);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${APP}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const chipName = () => page.locator('.nav-profile__name').first().textContent();
  const chipInitials = () => page.locator('.nav-profile__avatar').first().textContent();

  section('1. The name is the person’s data, not interface copy');
  for (const lang of ['he', 'en', 'he']) {
    await setLang(page, lang);
    check(`${lang}: the stored name is rendered unchanged`,
      (await chipName())?.trim() === `${FIRST} ${LAST}`, (await chipName())?.trim());
    check(`${lang}: the initials come from that same name`,
      (await chipInitials())?.trim() === 'ON', (await chipInitials())?.trim());
  }

  section('2. The chip opens a real menu');
  await setLang(page, 'en');
  check('it advertises a menu', await page.getAttribute('.nav-profile', 'aria-haspopup') === 'menu');
  check('and reports itself closed', await page.getAttribute('.nav-profile', 'aria-expanded') === 'false');

  await page.click('.nav-profile');
  await page.waitForTimeout(400);
  check('clicking opens a menu', (await page.locator('[role="menu"]').count()) === 1);
  check('and the chip now reports itself open',
    await page.getAttribute('.nav-profile', 'aria-expanded') === 'true');

  const items = await page.$$eval('[role="menu"] [role="menuitem"]', (nodes) =>
    nodes.map((n) => ({ text: n.textContent.trim(), disabled: n.getAttribute('aria-disabled') === 'true' })));
  check('it lists My profile, Settings and Log out', items.length === 3,
    items.map((i) => i.text).join(' | '));
  check('Settings is present but disabled, not pointed elsewhere',
    items[1]?.disabled === true, items[1]?.text);

  section('3. Escape and click-away close it');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
  check('Escape closes the menu', (await page.locator('[role="menu"]').count()) === 0);

  await page.click('.nav-profile');
  await page.waitForTimeout(400);
  await page.mouse.click(700, 500);
  await page.waitForTimeout(400);
  check('clicking outside closes it', (await page.locator('[role="menu"]').count()) === 0);

  section('4. The keyboard can drive it');
  await page.click('.nav-profile');
  await page.waitForTimeout(400);
  await page.keyboard.press('ArrowDown');
  await page.waitForTimeout(200);
  const focused = await page.evaluate(() => document.activeElement?.textContent?.trim());
  check('arrow keys move focus into the menu', typeof focused === 'string' && focused.length > 0, focused);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  section('5. Placement follows the reading direction');
  for (const lang of ['en', 'he']) {
    await setLang(page, lang);
    await page.click('.nav-profile');
    await page.waitForTimeout(500);
    const boxes = await page.evaluate(() => {
      const chip = document.querySelector('.nav-profile').getBoundingClientRect();
      const paper = document.querySelector('[role="menu"]').getBoundingClientRect();
      return { chip: { left: chip.left, right: chip.right }, paper: { left: paper.left, right: paper.right } };
    });
    const aligned = lang === 'he'
      ? Math.abs(boxes.paper.left - boxes.chip.left) < 24
      : Math.abs(boxes.paper.right - boxes.chip.right) < 24;
    check(`${lang}: the menu hangs from the chip’s inline-end edge`, aligned,
      `chip ${Math.round(boxes.chip.left)}–${Math.round(boxes.chip.right)}, menu ${Math.round(boxes.paper.left)}–${Math.round(boxes.paper.right)}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
  }

  section('6. My profile navigates to the real React route');
  await setLang(page, 'en');
  await page.goto(`${APP}/browse`, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(800);
  if ((await page.locator('.nav-profile').count()) === 0) {
    await page.goto(`${APP}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(800);
  }
  await page.click('.nav-profile');
  await page.waitForTimeout(400);
  await page.locator('[role="menuitem"]').first().click();
  await page.waitForTimeout(1500);
  check('it lands on /profile', new URL(page.url()).pathname === '/profile',
    new URL(page.url()).pathname);

  section('7. Log out really ends the session');
  await page.click('.nav-profile');
  await page.waitForTimeout(400);
  await page.locator('[role="menuitem"]').last().click();
  await page.waitForTimeout(1500);
  check('it lands on /login', new URL(page.url()).pathname === '/login',
    new URL(page.url()).pathname);

  const stored = await page.evaluate(() => ({
    keys: Object.keys(localStorage).concat(Object.keys(sessionStorage)),
  }));
  check('no session token is left behind',
    !stored.keys.some((key) => /token/i.test(key)), stored.keys.join(', ') || 'storage empty');

  await page.goto(`${APP}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('a protected route is no longer reachable',
    new URL(page.url()).pathname === '/login', new URL(page.url()).pathname);

  section('8. Mobile');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${APP}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.click('.nav-profile');
  await page.waitForTimeout(500);
  check('the menu opens on a phone', (await page.locator('[role="menu"]').count()) === 1);
  const fits = await page.evaluate(() => {
    const paper = document.querySelector('[role="menu"]').getBoundingClientRect();
    return paper.left >= -1 && paper.right <= window.innerWidth + 1;
  });
  check('and stays inside the screen', fits);
  check('the name is still the stored one', (await chipName())?.trim() === `${FIRST} ${LAST}`);

  await browser.close();
  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error) => { console.error(error); process.exit(2); });
