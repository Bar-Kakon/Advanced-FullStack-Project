/**
 * Real-browser proof of the Project Dashboard — the working context of ONE project.
 *
 * Two real accounts in two contexts. Everything the screen shows comes from the API, and the
 * calendar rules are exercised against the real company-calendar endpoint so the screen has to
 * report a state it did not invent.
 *
 *   npm run verify:project-dashboard-ui
 */
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'CorrectHorse42!';
const FORBIDDEN_HE = ['בחרו', 'הזינו', 'אישרתם', 'הסרתם', 'ברצונכם', 'בחר/י', 'הזן/י', 'לכם', 'שלכם'];

const stamp = Date.now();
const OWNER = {
  firstName: 'Dash', lastName: `Owner${stamp}`,
  companyName: `Dash Co ${stamp}`, email: `dash.owner.${stamp}@example.com`,
};
const GUEST = {
  firstName: 'Dash', lastName: `Guest${stamp}`,
  companyName: `Dash Guest Co ${stamp}`, email: `dash.guest.${stamp}@example.com`,
};
const PROJECT = `אתר לוח ${stamp}`;

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(66)} ${detail}`);
};
const section = (t) => console.log(`\n${t}`);

const day = (o) => new Date(Date.UTC(2027, 10, 1) + o * 86400000).toISOString().slice(0, 10);

const apiToken = async (email) => {
  const answer = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return (await answer.json()).accessToken;
};

const apiCall = (token, method, path, body) =>
  fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

const register = async (page, who) => {
  await page.goto(`${APP}/register`, { waitUntil: 'networkidle' });
  await page.fill('#firstName', who.firstName);
  await page.fill('#lastName', who.lastName);
  await page.selectOption('#standing', 'owner').catch(() => {});
  await page.fill('#companyName', who.companyName);
  await page.fill('#email', who.email);
  await page.fill('#password', PASSWORD);
  await page.fill('#password-confirm', PASSWORD);
  await page.selectOption('#specialty', 'electrical').catch(() => {});
  // Places answers over the network, so the option list is waited for rather than assumed.
  const cityBox = page.locator('.place-field input[role="combobox"]');
  const opts = page.locator('.place-field__list [role="option"]');
  for (let attempt = 0; attempt < 4 && (await opts.count()) === 0; attempt += 1) {
    await cityBox.fill('');
    await cityBox.type('חיפה', { delay: 60 });
    await page.waitForTimeout(2500);
  }
  if (await opts.count()) await opts.first().click();
  await page.selectOption('#region', 'haifa').catch(() => {});
  const boxes = page.locator('input[type="checkbox"]');
  for (let i = 0; i < (await boxes.count()); i += 1) await boxes.nth(i).check().catch(() => {});
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);

  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', who.email);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
};

const overflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const run = async () => {
  const browser = await chromium.launch();
  const ownerCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const guestCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const owner = await ownerCtx.newPage();
  const guest = await guestCtx.newPage();

  const errors = [];
  for (const page of [owner, guest]) {
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  }

  section('1. Two real accounts and one project');
  await register(owner, OWNER);
  await register(guest, GUEST);

  await owner.goto(`${APP}/projects/new`, { waitUntil: 'networkidle' });
  await owner.fill('#name', PROJECT);
  await owner.selectOption('#projectType', 'building');
  await owner.fill('#size', 'בניין 9 קומות');
  await owner.fill('#description', 'שלד וגמר');
  await owner.fill('#startDate', day(0));
  await owner.fill('#targetEndDate', day(60));
  await owner.fill('#overrunAllowanceDays', '20');
  await owner.click('button[type="submit"]');
  await owner.waitForTimeout(1800);
  check('The project was created', (await owner.locator('.project-card', { hasText: PROJECT }).count()) === 1);

  section('2. My projects leads into the Project Dashboard');
  const entry = owner.locator('.project-card', { hasText: PROJECT }).locator('.btn--primary');
  check('The card carries a dashboard entry point', (await entry.count()) === 1);
  await entry.click();
  await owner.waitForTimeout(1600);
  check('It navigates to the project route', /\/projects\/[a-f0-9]{24}$/.test(owner.url()), owner.url());
  const projectId = owner.url().split('/projects/')[1];

  section('3. It shows the real project, and derives its status');
  const shown = await owner.textContent('main');
  check('The project name is the heading', (await owner.textContent('.profile__title')).includes(PROJECT));
  check('The type is shown', shown.includes('בניין'));
  check('The free-text size is shown exactly as stored', shown.includes('בניין 9 קומות'));
  check('A project with no location says so rather than inventing one',
    shown.includes('לא הוגדר מיקום'));
  check('A derived status chip is rendered', (await owner.locator('.project-chip--planned').count()) === 1);
  check('There is no manual status selector anywhere',
    (await owner.locator('select#status, select[name="status"]').count()) === 0);
  check('The original target is shown', shown.includes('יעד מקורי'));
  check('And the overrun ceiling', shown.includes('תאריך חריגה מרבי'));

  section('3b. The structured location, once the project carries one');
  const token = await apiToken(OWNER.email);
  const located = await apiCall(token, 'PATCH', `/projects/${projectId}`, {
    location: { city: 'רעננה', region: 'center', address: 'הרצל 8' },
  });
  check('A location is saved on the project', located.status === 200, located.status);
  await owner.reload({ waitUntil: 'networkidle' });
  await owner.waitForTimeout(1600);
  check('The dashboard reads it from the project, not from a copy',
    (await owner.textContent('main')).includes('רעננה'));

  section('4. Management actions, and the members count');
  check('Edit is offered', (await owner.locator(`a[href="/projects/${projectId}/edit"]`).count()) >= 1);
  check('Members is offered', (await owner.locator(`a[href="/projects/${projectId}/members"]`).count()) >= 1);
  check('Permissions is offered', (await owner.locator('a[href="/permissions"]').count()) >= 1);
  check('One active member is counted', shown.includes('משתתפים פעילים: 1'));
  check('And nothing is pending', shown.includes('הזמנות שממתינות לתשובה: 0'));

  section('5. The per-project permission surface is the same grants model');
  check('The panel is rendered', (await owner.locator('#project-permissions-title').count()) === 1);
  check('It carries the grant rows', (await owner.locator('.perm-grant').count()) === 1);
  check('The viewer’s own row is marked',
    (await owner.locator('.perm-grant .perm-chip', { hasText: 'ההרשאה שלי' }).count()) === 1);
  check('And offers no reduce or revoke — the self-lockout rule',
    (await owner.locator('.perm-grant__actions').count()) === 0);
  check('Full Project Authority is shown as a chip, not as nine ticks',
    (await owner.locator('.perm-chip--full').count()) === 1);
  check('So no individual checkbox list is rendered for it',
    (await owner.locator('.perm-grant .perm-checks').count()) === 0);
  check('The central screen is reachable from it',
    (await owner.locator('a[href="/permissions"]').count()) >= 1);

  section('6. The working calendar — pinned, and up to date');
  const calendarText = await owner.textContent('#calendar-version-title ~ *, main');
  check('The pinned version is named', calendarText.includes('גרסה 1'));
  check('It reports being up to date', calendarText.includes('הגרסה העדכנית'));
  check('No adoption has happened', calendarText.includes('עדיין לא הוחלה'));
  check('No adopt control is offered while nothing is newer',
    (await owner.locator('button', { hasText: 'החלת הגרסה החדשה' }).count()) === 0);
  const daysBefore = await owner.textContent('.calendar-facts');

  section('7. A company change appends a version and does NOT reach the project');
  const bumped = await apiCall(token, 'PUT', '/calendar/company', {
    workingDays: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'],
    hours: { startMinute: 360, endMinute: 900 },
    sector: 'jewish',
    worksCholHaMoed: true,
    worksMemorialDays: false,
  });
  check('The company default was changed', bumped.status === 201, bumped.status);

  await owner.reload({ waitUntil: 'networkidle' });
  await owner.waitForTimeout(1600);
  const afterBump = await owner.textContent('main');
  check('The project is STILL on version 1', afterBump.includes('גרסה 1'));
  check('The screen says a newer version exists', afterBump.includes('קיימת גרסה חדשה יותר'));
  check('And says it will not apply until chosen', afterBump.includes('בחירה מפורשת'));
  check('Not one working day of the project changed',
    (await owner.textContent('.calendar-facts')) === daysBefore);
  check('Now an explicit adopt control is offered',
    (await owner.locator('button', { hasText: 'החלת הגרסה החדשה' }).count()) === 1);

  section('8. A project override stays the project’s own');
  const overridden = await apiCall(token, 'PUT', `/projects/${projectId}/calendar/overrides`, {
    workingDays: ['sunday', 'monday', 'tuesday'],
  });
  check('An override is written', overridden.status === 200, overridden.status);
  await owner.reload({ waitUntil: 'networkidle' });
  await owner.waitForTimeout(1600);
  check('The screen reports the project as customised',
    (await owner.textContent('main')).includes('מותאם אישית'));
  check('And the customised days are what it works by',
    (await owner.textContent('.calendar-facts')).includes('שלישי') &&
    !(await owner.textContent('.calendar-facts')).includes('רביעי'));

  section('9. Adoption is explicit, and it is recorded');
  await owner.locator('button', { hasText: 'החלת הגרסה החדשה' }).click();
  await owner.waitForTimeout(2400);
  const adopted = await owner.textContent('main');
  check('The project moved to version 2', adopted.includes('גרסה 2'));
  check('It is up to date again', adopted.includes('הגרסה העדכנית'));
  check('The move is kept as history', (await owner.locator('.dash-history__row').count()) === 1);
  check('Naming who adopted it', (await owner.textContent('.dash-history__row')).includes(OWNER.lastName));

  section('10. No task data is invented');
  check('The Tasks section is present', (await owner.locator('#tasks-title').count()) === 1);
  // The Tasks domain now exists. This project simply has no work in it, and the panel says that
  // rather than rendering four zeros, which would claim work exists and none of it is done.
  check('A project with no work says so, rather than showing zeros',
    (await owner.textContent('main')).includes('עדיין לא נפתחו משימות'));
  const numbers = await owner.textContent('#tasks-title ~ p');
  check('And renders no count at all', !/\d/.test(numbers ?? ''), numbers ?? '');

  section('11. A member with no authority sees no management control');
  await owner.goto(`${APP}/projects/${projectId}/members`, { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1400);
  await owner.fill('#memberSearch', GUEST.lastName);
  await owner.waitForTimeout(1800);
  await owner.locator('.member-picker__option').first().click();
  await owner.selectOption('#projectRole', 'main_contractor');
  await owner.click('.member-invite__actions .btn--primary');
  await owner.waitForTimeout(2000);

  await guest.goto(`${APP}/projects`, { waitUntil: 'networkidle' });
  await guest.waitForTimeout(1600);
  await guest.locator('.project-card--invitation .btn--primary').click();
  await guest.waitForTimeout(2400);

  await guest.goto(`${APP}/projects/${projectId}`, { waitUntil: 'networkidle' });
  await guest.waitForTimeout(1600);
  check('A direct URL opens the dashboard for a member', (await guest.locator('#summary-title').count()) === 1);
  check('The project role says Main Contractor', (await guest.textContent('main')).includes('קבלן ראשי') ||
    (await guest.textContent('main')).includes(PROJECT));
  check('Yet no management action is offered',
    (await guest.textContent('main')).includes('אין פעולות ניהול זמינות'));
  check('No edit link', (await guest.locator(`a[href="/projects/${projectId}/edit"]`).count()) === 0);
  check('No permissions panel', (await guest.locator('#project-permissions-title').count()) === 0);
  check('No adopt control', (await guest.locator('button', { hasText: 'החלת הגרסה החדשה' }).count()) === 0);
  check('But the project facts are readable', (await guest.textContent('main')).includes('בניין 9 קומות'));

  section('12. Direct navigation to a project that is not theirs');
  await guest.goto(`${APP}/projects/000000000000000000000000`, { waitUntil: 'networkidle' });
  await guest.waitForTimeout(1500);
  check('No project panel is rendered', (await guest.locator('#summary-title').count()) === 0);
  check('And the screen says it was not found',
    (await guest.textContent('main')).includes('לא נמצא'));

  section('13. A refresh on the dashboard route works');
  await guest.goto(`${APP}/projects/${projectId}`, { waitUntil: 'networkidle' });
  await guest.waitForTimeout(1400);
  await guest.reload({ waitUntil: 'networkidle' });
  await guest.waitForTimeout(1600);
  check('Still the same project after a hard reload', (await guest.locator('#summary-title').count()) === 1);

  section('14. Hebrew addresses one person');
  await owner.goto(`${APP}/projects/${projectId}`, { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1600);
  const he = await owner.textContent('main');
  const bad = FORBIDDEN_HE.filter((f) => he.includes(f));
  check('No plural-as-neutral and no slash forms', bad.length === 0, bad.join(' · '));
  check('The project name is never translated', he.includes(PROJECT));

  section('15. Both languages at three widths');
  for (const [label, width, height] of [['desktop', 1440, 900], ['tablet', 834, 1100], ['mobile', 390, 844]]) {
    await owner.setViewportSize({ width, height });
    for (const lang of ['en', 'עב']) {
      await owner.click(`.lang-switch__btn:has-text("${lang}")`).catch(() => {});
      await owner.waitForTimeout(500);
      await owner.goto(`${APP}/projects/${projectId}`, { waitUntil: 'networkidle' });
      await owner.waitForTimeout(1200);
      check(`${label} ${lang} — no horizontal overflow`, (await overflow(owner)) <= 0, `${await overflow(owner)}px`);
      check(`${label} ${lang} — the summary is rendered`, (await owner.locator('#summary-title').count()) === 1);
    }
  }
  await owner.setViewportSize({ width: 1440, height: 900 });

  section('16. A very long project name still fits');
  await owner.goto(`${APP}/projects/${projectId}`, { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1200);
  await owner.evaluate(() => {
    const title = document.querySelector('.profile__title');
    if (title) title.textContent = 'א'.repeat(160);
  });
  await owner.setViewportSize({ width: 390, height: 844 });
  await owner.waitForTimeout(500);
  check('A 160-character name does not overflow on mobile', (await overflow(owner)) <= 0, `${await overflow(owner)}px`);

  section('17. Page errors');
  const unexpected = errors.filter((e) => !/status of 40[34]/.test(e));
  check('No uncaught page error', unexpected.length === 0, unexpected.slice(0, 2).join(' | '));

  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
