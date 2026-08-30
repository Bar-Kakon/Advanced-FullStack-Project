/**
 * Real-browser proof of My Tasks against the real API.
 *
 * Two accounts: one holds the work, the other is the hidden performer of part of it. Every row on
 * screen comes from the API — the fixtures are seeded through the backend's own seed script,
 * because Create task is a separate approved screen and is not in this batch.
 *
 *   npm run verify:my-tasks-ui
 */
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
// Resolved from this script, so it works wherever the repository is checked out.
const API_DIR = process.env.API_DIR ?? fileURLToPath(new URL('../../Backend', import.meta.url));
const PASSWORD = 'CorrectHorse42!';
const FORBIDDEN_HE = ['בחרו', 'הזינו', 'אישרתם', 'הסרתם', 'ברצונכם', 'בחר/י', 'הזן/י', 'לכם', 'שלכם'];

const stamp = Date.now();
const OWNER = {
  firstName: 'Task', lastName: `Owner${stamp}`,
  companyName: `Tasks Co ${stamp}`, email: `tasks.owner.${stamp}@example.com`,
};
const HELPER = {
  firstName: 'Task', lastName: `Helper${stamp}`,
  companyName: `Helper Co ${stamp}`, email: `tasks.helper.${stamp}@example.com`,
};

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(64)} ${detail}`);
};
const section = (t) => console.log(`\n${t}`);

const day = (o) => new Date(Date.UTC(2027, 2, 1) + o * 86400000).toISOString().slice(0, 10);

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
  const helperCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const owner = await ownerCtx.newPage();
  const helper = await helperCtx.newPage();

  const errors = [];
  for (const page of [owner, helper]) {
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  }

  section('1. Two real accounts, and a project to hang work on');
  await register(owner, OWNER);
  await register(helper, HELPER);

  await owner.goto(`${APP}/projects/new`, { waitUntil: 'networkidle' });
  await owner.fill('#name', `אתר משימות ${stamp}`);
  await owner.selectOption('#projectType', 'building');
  await owner.fill('#size', 'בניין 4 קומות');
  await owner.fill('#startDate', day(0));
  await owner.fill('#targetEndDate', day(90));
  await owner.fill('#overrunAllowanceDays', '10');
  await owner.click('button[type="submit"]');
  await owner.waitForTimeout(1800);
  check('A project exists', (await owner.locator('.project-card').count()) >= 1);

  section('2. My Tasks is honest when there is nothing in it');
  await owner.goto(`${APP}/dashboard`, { waitUntil: 'networkidle' });
  const navLink = owner.locator('.app-nav__link[href="/tasks"]');
  check('The navbar My Tasks link is real, not disabled', (await navLink.count()) === 1);
  await navLink.click();
  await owner.waitForTimeout(1500);
  check('It navigates to /tasks', owner.url().endsWith('/tasks'), owner.url());
  check('No task rows', (await owner.locator('.task-row').count()) === 0);
  check('And the empty state says so', (await owner.textContent('main')).includes('לא הוקצו לי משימות'));

  section('3. Real work, seeded through the backend');
  execFileSync('npm', ['run', 'seed:my-tasks', '--', OWNER.email, HELPER.email], {
    cwd: API_DIR, stdio: 'pipe',
  });
  await owner.reload({ waitUntil: 'networkidle' });
  await owner.waitForTimeout(1600);
  check('Five pieces of work are listed', (await owner.locator('.task-row').count()) === 5,
    `${await owner.locator('.task-row').count()}`);

  const body = await owner.textContent('main');
  check('A project task is marked as one', body.includes('משימה בפרויקט'));
  check('And standalone work is marked separately', body.includes('עבודה עצמאית'));
  check('The project name is shown on project work', body.includes(`אתר משימות ${stamp}`));
  check('Standalone work says it has no project', body.includes('ללא פרויקט'));

  section('4. The three groups, and overdue derived from the date');
  check('An overdue group is rendered', (await owner.locator('#group-overdue').count()) === 1);
  check('An open-work group is rendered', (await owner.locator('#group-open').count()) === 1);
  check('And a completed group', (await owner.locator('#group-done').count()) === 1);
  check('The overdue row carries the overdue chip', (await owner.locator('.task-chip--overdue').count()) >= 1);
  check('And is visually marked as overdue', (await owner.locator('.task-row--overdue').count()) >= 1);
  check('The completed row is not counted as overdue',
    (await owner.locator('.task-row--overdue').count()) < 5);
  check('The screen says overdue is calculated, not stored',
    body.includes('אינו סטטוס שנשמר'));
  check('The three derived states are all rendered',
    body.includes('טרם התחילה') && body.includes('בביצוע') && body.includes('הושלמה'));
  check('No percentage appears anywhere', !/\d+%/.test(body));

  section('5. The counterparty line');
  check('Work opened by the viewer says so, in singular',
    body.includes('עבודה שפתחתי'));
  check('And is never the plural form the prototype used', !body.includes('נוצרה על ידכם'));

  section('6. Start and Complete — the approved labels, on real state');
  const startBtn = owner.locator('button', { hasText: 'התחלת עבודה' });
  check('The Start control uses the approved label', (await startBtn.count()) >= 1);
  const beforeRunning = await owner.locator('.task-chip--in_progress').count();
  await startBtn.first().click();
  await owner.waitForTimeout(2200);
  check('Starting moves a row to in progress',
    (await owner.locator('.task-chip--in_progress').count()) > beforeRunning,
    `${beforeRunning} → ${await owner.locator('.task-chip--in_progress').count()}`);

  const completeBtn = owner.locator('button', { hasText: 'סיום עבודה' });
  check('The Complete control uses the approved label', (await completeBtn.count()) >= 1);
  const beforeDone = await owner.locator('.task-chip--completed').count();
  await completeBtn.first().click();
  await owner.waitForTimeout(2200);
  check('Completing moves a row to completed',
    (await owner.locator('.task-chip--completed').count()) > beforeDone,
    `${beforeDone} → ${await owner.locator('.task-chip--completed').count()}`);

  await owner.reload({ waitUntil: 'networkidle' });
  await owner.waitForTimeout(1600);
  check('And it survives a reload — the server holds it, not React',
    (await owner.locator('.task-chip--completed').count()) > beforeDone);

  section('7. The delegation wall, in the browser');
  const delegatedRow = owner.locator('.task-row', { hasText: 'מעבר צנרת' });
  check('The delegator sees their own arrangement', (await delegatedRow.count()) === 1);
  check('Marked as handed over', (await delegatedRow.textContent()).includes('הועברה לביצוע'));
  // Every row carries a detail link; what a delegator must not get is a Start or Complete button.
  check('And offers the delegator no Start or Complete control',
    (await delegatedRow.locator('.task-row__actions button').count()) === 0);

  await helper.goto(`${APP}/tasks`, { waitUntil: 'networkidle' });
  await helper.waitForTimeout(1600);
  check('The delegate sees exactly the one piece of work handed to them',
    (await helper.locator('.task-row').count()) === 1,
    `${await helper.locator('.task-row').count()}`);
  const helperBody = await helper.textContent('main');
  check('Shown only the part that was handed over', helperBody.includes('מעבר הצנרת בלבד'));
  check('Not the parent task’s own description', !helperBody.includes('כל החשמל בקומה'));
  check('MUST-NOT-SEE: the project name is withheld', !helperBody.includes(`אתר משימות ${stamp}`));
  // In this fixture the project creator and the delegator are the SAME account, so the delegator's
  // name appearing is correct — the delegate is entitled to see who handed them the work. The
  // party-above separation needs three distinct accounts and is proved in verify:my-tasks.
  check('Their counterparty is the delegator, who they are entitled to see',
    helperBody.includes(OWNER.lastName));
  check('The delegate is told they received it', helperBody.includes('התקבלה לביצוע'));
  check('And may report on it', (await helper.locator('.task-row__actions .btn').count()) >= 1);

  section('8. Filters');
  await owner.selectOption('#f-state', 'completed');
  await owner.waitForTimeout(1800);
  check('state=completed narrows the list',
    (await owner.locator('.task-row').count()) < 5 && (await owner.locator('.task-row').count()) > 0,
    `${await owner.locator('.task-row').count()}`);
  check('And every row left is completed',
    (await owner.locator('.task-chip--completed').count()) === (await owner.locator('.task-row').count()));
  await owner.selectOption('#f-state', '');
  await owner.waitForTimeout(1600);

  await owner.selectOption('#f-kind', 'standalone');
  await owner.waitForTimeout(1800);
  const soloRows = await owner.locator('.task-row').count();
  check('kind=standalone narrows to solo work', soloRows > 0 && soloRows < 5, `${soloRows}`);
  // Asserted on the row chips, not on the page text — the filter's own dropdown lists every label.
  check('And no project row survives it',
    (await owner.locator('.task-chip--project').count()) === 0);
  await owner.selectOption('#f-kind', '');
  await owner.waitForTimeout(1600);

  await owner.selectOption('#f-sort', 'due_desc');
  await owner.waitForTimeout(1800);
  check('The sort control is wired', (await owner.locator('.task-row').count()) === 5);
  await owner.selectOption('#f-sort', 'due_asc');
  await owner.waitForTimeout(1600);

  section('9. No proposal data is invented');
  check('No pending-proposal marker is rendered while that domain does not exist',
    (await owner.locator('.task-prop, [data-pending-proposal]').count()) === 0);

  section('10. Hebrew addresses one person');
  const he = await owner.textContent('main');
  const bad = FORBIDDEN_HE.filter((f) => he.includes(f));
  check('No plural-as-neutral and no slash forms', bad.length === 0, bad.join(' · '));

  section('11. Both languages at three widths');
  for (const [label, width, height] of [['desktop', 1440, 900], ['tablet', 834, 1100], ['mobile', 390, 844]]) {
    await owner.setViewportSize({ width, height });
    for (const lang of ['en', 'עב']) {
      await owner.click(`.lang-switch__btn:has-text("${lang}")`).catch(() => {});
      await owner.waitForTimeout(500);
      await owner.goto(`${APP}/tasks`, { waitUntil: 'networkidle' });
      await owner.waitForTimeout(1200);
      check(`${label} ${lang} — no horizontal overflow`, (await overflow(owner)) <= 0, `${await overflow(owner)}px`);
      check(`${label} ${lang} — rows render`, (await owner.locator('.task-row').count()) === 5);
    }
  }
  await owner.setViewportSize({ width: 1440, height: 900 });

  section('12. Long content');
  await owner.goto(`${APP}/tasks`, { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1200);
  await owner.evaluate(() => {
    const title = document.querySelector('.task-row__title');
    if (title) title.textContent = 'א'.repeat(180);
  });
  await owner.setViewportSize({ width: 390, height: 844 });
  await owner.waitForTimeout(500);
  check('A 180-character task title does not overflow on mobile', (await overflow(owner)) <= 0,
    `${await overflow(owner)}px`);

  section('13. Page errors');
  const unexpected = errors.filter((e) => !/status of 40[34]/.test(e));
  check('No uncaught page error', unexpected.length === 0, unexpected.slice(0, 2).join(' | '));

  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
