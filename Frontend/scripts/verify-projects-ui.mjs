/**
 * Real-browser proof of My projects and Create / Edit project against the real API.
 *
 * Register → no projects → create → it appears → edit → it persists across a reload → the closed
 * date rules hold → cancellation removes it. Then both languages at three widths.
 *
 *   npm run verify:projects-ui
 */
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const PASSWORD = 'CorrectHorse42!';
const FORBIDDEN_HE = ['בחרו', 'הזינו', 'אישרתם', 'הסרתם', 'ברצונכם', 'בחר/י', 'הזן/י', 'לכם', 'שלכם'];

const stamp = Date.now();
const ME = {
  firstName: 'Proj', lastName: `Owner${stamp}`,
  companyName: `Proj Co ${stamp}`, email: `projects.${stamp}@example.com`,
};
const NAME = `מגדל בדיקה ${stamp}`;

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(60)} ${detail}`);
};
const section = (t) => console.log(`\n${t}`);

const day = (o) => new Date(Date.UTC(2027, 0, 10) + o * 86400000).toISOString().slice(0, 10);

const run = async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

  section('1. A real account');
  await page.goto(`${APP}/register`, { waitUntil: 'networkidle' });
  await page.fill('#firstName', ME.firstName);
  await page.fill('#lastName', ME.lastName);
  await page.selectOption('#standing', 'owner').catch(() => {});
  await page.fill('#companyName', ME.companyName);
  await page.fill('#email', ME.email);
  await page.fill('#password', PASSWORD);
  await page.fill('#password-confirm', PASSWORD);
  await page.selectOption('#specialty', 'electrical').catch(() => {});
  const cityBox = page.locator('.place-field input[role="combobox"]');
  await cityBox.fill('חיפה');
  await page.waitForTimeout(2200);
  const opts = page.locator('.place-field__list [role="option"]');
  if (await opts.count()) await opts.first().click();
  await page.selectOption('#region', 'haifa').catch(() => {});
  const boxes = page.locator('input[type="checkbox"]');
  for (let i = 0; i < (await boxes.count()); i += 1) await boxes.nth(i).check().catch(() => {});
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', ME.email);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  section('2. Reachable, and honest when empty');
  await page.goto(`${APP}/dashboard`, { waitUntil: 'networkidle' });
  const navLink = page.locator('.app-nav__link[href="/projects"]');
  check('The navbar Projects link is real', (await navLink.count()) === 1);
  await navLink.click();
  await page.waitForTimeout(1200);
  check('It navigates to /projects', page.url().includes('/projects'), page.url());
  check('No projects are listed', (await page.locator('.project-card').count()) === 0);
  check('And the empty state says so', (await page.locator('.panel__lede').count()) > 0);

  section('3. Create');
  await page.click('a[href="/projects/new"]');
  await page.waitForTimeout(900);
  await page.fill('#name', NAME);
  await page.selectOption('#projectType', 'building');
  await page.fill('#size', 'בניין 12 קומות');
  await page.fill('#description', 'שלד וגמר');
  await page.fill('#startDate', day(0));
  await page.fill('#targetEndDate', day(100));
  await page.fill('#overrunAllowanceDays', '30');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1800);
  check('It returns to the list', page.url().endsWith('/projects'), page.url());
  check('The project is listed', (await page.locator('.project-card').count()) === 1);
  check('With its real name', (await page.textContent('.project-card__name'))?.includes(NAME));
  const card = await page.textContent('.project-card');
  check('The type is shown', card.includes('בניין'));
  check('And the free-text size exactly as typed', card.includes('בניין 12 קומות'));
  check('And a derived status chip', (await page.locator('.project-chip--planned').count()) === 1);

  section('4. Create validation');
  await page.goto(`${APP}/projects/new`, { waitUntil: 'networkidle' });
  await page.click('button[type="submit"]');
  await page.waitForTimeout(600);
  check('An empty form does not submit', page.url().includes('/projects/new'));
  check('And names the missing fields', (await page.locator('.field-error--visible').count()) >= 3,
    `${await page.locator('.field-error--visible').count()} errors`);

  await page.fill('#name', 'backwards');
  await page.selectOption('#projectType', 'villa');
  await page.fill('#size', 'וילה אחת');
  await page.fill('#startDate', day(50));
  await page.fill('#targetEndDate', day(10));
  await page.fill('#overrunAllowanceDays', '5');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(600);
  check('A target before the start is refused', page.url().includes('/projects/new'));

  section('4b. `אחר` reveals free text and requires it');
  await page.goto(`${APP}/projects/new`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  check('No free-text box before choosing other', (await page.locator('#projectTypeOther').count()) === 0);
  await page.selectOption('#projectType', 'other');
  await page.waitForTimeout(300);
  check('Choosing other reveals it', (await page.locator('#projectTypeOther').count()) === 1);
  await page.fill('#name', 'other type');
  await page.fill('#size', 'מבנה אחד');
  await page.fill('#startDate', day(0));
  await page.fill('#targetEndDate', day(30));
  await page.fill('#overrunAllowanceDays', '5');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(700);
  check('And it is required', page.url().includes('/projects/new'));
  await page.fill('#projectTypeOther', 'מבנה חקלאי');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1800);
  check('With the text filled in, it saves', page.url().endsWith('/projects'), page.url());
  check('And the card shows the free text, not "אחר"',
    (await page.textContent('body')).includes('מבנה חקלאי'));

  section('5. Edit — persists, and the ceiling holds');
  await page.goto(`${APP}/projects`, { waitUntil: 'networkidle' });
  await page.locator('.project-card', { hasText: NAME }).locator('.project-card__actions a').click();
  await page.waitForTimeout(1400);
  check('The form loads the stored values', (await page.inputValue('#name')) === NAME);
  check('The allowance is a stated fact, not an input',
    (await page.locator('#overrunAllowanceDays').count()) === 0 &&
    (await page.locator('.project-allowance').count()) === 1);

  await page.fill('#targetEndDate', day(131));
  await page.click('button[type="submit"]');
  await page.waitForTimeout(900);
  check('A target past the ceiling is refused', !page.url().endsWith('/projects'), page.url());

  await page.fill('#targetEndDate', day(120));
  await page.fill('#name', `${NAME} — עדכון`);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1800);
  check('A valid edit saves', page.url().endsWith('/projects'), page.url());

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const body = await page.textContent('body');
  check('The change survives a reload', body.includes('עדכון'));
  check('The original target is shown once the target moved', body.includes('2027'));
  check('And the actual overrun is stated', (await page.locator('.project-card__overrun').count()) >= 1);

  section('5b. The calendar panel shows what the project works by');
  await page.goto(`${APP}/projects`, { waitUntil: 'networkidle' });
  await page.locator('.project-card', { hasText: NAME }).locator('.project-card__actions a').click();
  await page.waitForTimeout(1400);
  check('A calendar panel is shown on Edit', (await page.locator('#project-calendar-title').count()) === 1);
  check('With real working days', (await page.locator('.calendar-facts dd').first().textContent()).length > 0);
  check('And no adopt control while the project is current',
    (await page.locator('.calendar-adopt').count()) === 0);

  section('6. Unauthorized / not-found');
  await page.goto(`${APP}/projects/6512c1f4c2b9e30012af0b21/edit`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('An unknown project id shows a not-found message', (await page.locator('.alert--error').count()) === 1);
  check('And offers no form to edit', (await page.locator('#name').count()) === 0);

  await page.goto(`${APP}/projects/not-an-id/edit`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('A malformed id behaves the same', (await page.locator('.alert--error').count()) === 1);

  section('7. Languages, widths, overflow');
  await page.goto(`${APP}/projects`, { waitUntil: 'networkidle' });
  for (const lang of ['he', 'en']) {
    await page.click(`.lang-switch__btn:has-text("${lang === 'he' ? 'עב' : 'EN'}")`);
    await page.waitForTimeout(300);
    for (const [label, w, h] of [['desktop', 1440, 900], ['tablet', 834, 1112], ['mobile', 390, 844]]) {
      await page.setViewportSize({ width: w, height: h });
      await page.waitForTimeout(250);
      const m = await page.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        dir: document.documentElement.dir || document.body.dir,
      }));
      check(`${lang} · ${label} ${w}px — 0px overflow`, m.overflow <= 0, `overflow=${m.overflow}px`);
      check(`${lang} · ${label} — ${lang === 'he' ? 'rtl' : 'ltr'}`, m.dir === (lang === 'he' ? 'rtl' : 'ltr'), m.dir);
    }
    await page.setViewportSize({ width: 1440, height: 900 });
  }

  section('8. Copy rules');
  await page.click('.lang-switch__btn:has-text("עב")');
  await page.waitForTimeout(300);
  const he = await page.textContent('main');
  const bad = FORBIDDEN_HE.filter((f) => he.includes(f));
  check('Hebrew addresses one person', bad.length === 0, bad.join(' · '));
  const dead = await page.$$eval('main a', (n) => n.filter((x) => {
    const h = x.getAttribute('href'); return h === null || h === '#' || h === '';
  }).length);
  check('No dead link in the screen body', dead === 0, `${dead}`);
  check('The project name is not translated', (await page.textContent('body')).includes(NAME));

  section('9. Cancellation removes it entirely');
  await page.goto(`${APP}/projects`, { waitUntil: 'networkidle' });
  await page.locator('.project-card', { hasText: NAME }).locator('.project-card__actions a').click();
  await page.waitForTimeout(1400);
  check('Cancellation is offered on a project that has not started',
    (await page.locator('.panel--danger').count()) === 1);
  await page.click('.panel--danger button');
  await page.waitForTimeout(400);
  await page.click('.btn--danger');
  await page.waitForTimeout(1800);
  check('It returns to the list', page.url().endsWith('/projects'), page.url());
  check('And the project is gone',
    (await page.locator('.project-card', { hasText: NAME }).count()) === 0);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  check('Still gone after a reload — no record left',
    (await page.locator('.project-card', { hasText: NAME }).count()) === 0);

  section('10. Page errors');
  // Section 6 asks for projects that do not exist on purpose, and the browser logs every 404
  // response as a console error. Those are the assertion succeeding, not the page failing.
  const unexpected = errors.filter((e) => !/status of 404/.test(e));
  check('No uncaught page error', unexpected.length === 0, unexpected.slice(0, 2).join(' | '));
  check('The deliberate not-found probes did 404', errors.some((e) => /status of 404/.test(e)));

  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
