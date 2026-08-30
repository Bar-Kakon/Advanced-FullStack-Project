/**
 * Real-browser proof of Task Detail, and of the Project Dashboard now reading real Task data.
 *
 * Three accounts so the three roles are distinct: the GC above, the responsible sub, and the
 * hidden performer. That is what makes the must-not-see checks meaningful on screen.
 *
 *   npm run verify:task-detail-ui
 */
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:3000/api';
const API_DIR = process.env.API_DIR ??
  '/private/tmp/claude-501/-Users-barrebeccakakon-Desktop-Advanced-FullStack-Project/35586ef7-529a-491b-939a-e377882a3d85/scratchpad/api/Backend';
const PASSWORD = 'CorrectHorse42!';
const FORBIDDEN_HE = ['בחרו', 'הזינו', 'אישרתם', 'הסרתם', 'ברצונכם', 'בחר/י', 'הזן/י', 'לכם', 'שלכם'];

const stamp = Date.now();
const GC = { firstName: 'Gc', lastName: `Above${stamp}`, companyName: `GC Co ${stamp}`, email: `td.gc.${stamp}@example.com` };
const SUB = { firstName: 'Sub', lastName: `Resp${stamp}`, companyName: `Sub Co ${stamp}`, email: `td.sub.${stamp}@example.com` };
const HELPER = { firstName: 'Help', lastName: `Perf${stamp}`, companyName: `Help Co ${stamp}`, email: `td.help.${stamp}@example.com` };
const PROJECT = `אתר פירוט ${stamp}`;

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(66)} ${detail}`);
};
const section = (t) => console.log(`\n${t}`);
const day = (o) => new Date(Date.UTC(2027, 5, 1) + o * 86400000).toISOString().slice(0, 10);

const apiToken = async (email) => {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  return (await r.json()).accessToken;
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
  const cityBox = page.locator('.place-field input[role="combobox"]');
  const opts = page.locator('.place-field__list [role="option"]');
  for (let a = 0; a < 4 && (await opts.count()) === 0; a += 1) {
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
  const ctxs = await Promise.all([0, 1, 2].map(() => browser.newContext({ viewport: { width: 1440, height: 900 } })));
  const [gc, sub, helper] = await Promise.all(ctxs.map((c) => c.newPage()));

  const errors = [];
  for (const page of [gc, sub, helper]) {
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  }

  section('1. Three accounts, one project, one member');
  await register(gc, GC);
  await register(sub, SUB);
  await register(helper, HELPER);

  await gc.goto(`${APP}/projects/new`, { waitUntil: 'networkidle' });
  await gc.fill('#name', PROJECT);
  await gc.selectOption('#projectType', 'building');
  await gc.fill('#size', 'בניין 6 קומות');
  await gc.fill('#startDate', day(0));
  await gc.fill('#targetEndDate', day(90));
  await gc.fill('#overrunAllowanceDays', '10');
  await gc.click('button[type="submit"]');
  await gc.waitForTimeout(1800);
  await gc.locator('.project-card', { hasText: PROJECT }).locator('.btn--primary').click();
  await gc.waitForTimeout(1500);
  const projectId = gc.url().split('/projects/')[1];

  const gcToken = await apiToken(GC.email);
  const subToken = await apiToken(SUB.email);

  // The sub joins the project for real, so their standing is genuine.
  const invite = await apiCall(gcToken, 'POST', `/projects/${projectId}/members`, {
    userId: (await (await apiCall(gcToken, 'GET', `/projects/${projectId}/members`)).json())
      .members[0].userId === undefined ? '' : undefined,
  }).catch(() => null);
  void invite;

  const people = await apiCall(gcToken, 'GET', `/browse/contractors?q=${encodeURIComponent(SUB.lastName)}&limit=5`);
  const subUserId = (await people.json()).contractors[0].userId;
  const invited = await apiCall(gcToken, 'POST', `/projects/${projectId}/members`, {
    userId: subUserId, projectRole: 'subcontractor',
  });
  check('The sub is invited to the project', invited.status === 201, invited.status);
  const membershipId = (await invited.json()).member.id;
  await apiCall(subToken, 'POST', `/project-invitations/${membershipId}/accept`);

  section('2. Real work, and the dashboard reading it');
  const dashBefore = await gc.textContent('main');
  check('With no tasks the dashboard says so rather than showing zeros',
    dashBefore.includes('עדיין לא נפתחו משימות'));

  execFileSync('npm', ['run', 'seed:my-tasks', '--', SUB.email, HELPER.email], { cwd: API_DIR, stdio: 'pipe' });
  await gc.reload({ waitUntil: 'networkidle' });
  await gc.waitForTimeout(1600);
  const dashAfter = await gc.textContent('main');
  check('Once work exists the dashboard shows a real total', /סך המשימות: [1-9]/.test(dashAfter));
  check('And a real overdue count', /באיחור: \d/.test(dashAfter));
  check('And a real completed count', /הושלמו: \d/.test(dashAfter));
  check('No percentage is shown anywhere', !/\d+%/.test(dashAfter));

  section('3. Task Detail from My Tasks');
  await sub.goto(`${APP}/tasks`, { waitUntil: 'networkidle' });
  await sub.waitForTimeout(1600);
  check('The sub has work', (await sub.locator('.task-row').count()) >= 4);
  await sub.locator('.task-row').first().locator('a[href^="/tasks/"]').click();
  await sub.waitForTimeout(1600);
  check('It opens the detail route', /\/tasks\/[a-f0-9]{24}$/.test(sub.url()), sub.url());
  const taskId = sub.url().split('/tasks/')[1];

  const detail = await sub.textContent('main');
  check('The detail names the project', detail.includes(PROJECT));
  check('It states that dependencies run between stages', detail.includes('בין שלבים'));
  check('It offers the private organisation panel', (await sub.locator('#private-title').count()) === 1);
  check('And the delegation panel', (await sub.locator('#delegation-title').count()) === 1);

  section('4. The date-change entry point is honest');
  check('The screen says the mechanism is not built',
    detail.includes('מנגנון שינוי התאריכים עדיין לא נבנה'));
  check('And offers no request control',
    (await sub.locator('button', { hasText: 'בקשה לשינוי תאריך' }).count()) === 0);
  check('No affected-task count is invented', !/משימות מושפעות: \d/.test(detail));

  section('5. The private execution layer');
  await sub.selectOption('#private-kind', 'subtask');
  await sub.fill('#private-body', 'סימון מסלול');
  await sub.locator('.private-add .btn--primary').click();
  await sub.waitForTimeout(2000);
  check('A private sub-task is added', (await sub.locator('.private-item').count()) === 1);
  const stateBefore = await sub.locator('.task-chip--not_started, .task-chip--in_progress, .task-chip--completed').first().textContent();
  // Server-controlled, so the box only ticks once the re-read lands.
  await sub.locator('.private-item input[type="checkbox"]').click();
  await sub.waitForTimeout(2400);
  check('The tick is written and read back',
    await sub.locator('.private-item input[type="checkbox"]').isChecked());
  const stateAfter = await sub.locator('.task-chip--not_started, .task-chip--in_progress, .task-chip--completed').first().textContent();
  check('Ticking it does not move the public state', stateBefore === stateAfter, `${stateBefore} → ${stateAfter}`);
  check('And the screen says so', (await sub.textContent('main')).includes('אינו משנה את מצב העבודה'));

  const gcPrivate = await gc.goto(`${APP}/tasks/${taskId}`, { waitUntil: 'networkidle' });
  void gcPrivate;
  await gc.waitForTimeout(1600);
  check('MUST-NOT-SEE: the GC sees no private item',
    (await gc.locator('.private-item').count()) === 0);

  section('6. Delegation, and the wall');
  await sub.goto(`${APP}/tasks/${taskId}`, { waitUntil: 'networkidle' });
  await sub.waitForTimeout(1400);
  await sub.fill('#memberSearch', HELPER.lastName);
  await sub.waitForTimeout(1800);
  check('The person picker finds the performer', (await sub.locator('.member-picker__option').count()) >= 1);
  await sub.locator('.member-picker__option').first().click();
  await sub.selectOption('#delegation-scope', 'part');
  await sub.waitForTimeout(300);
  await sub.fill('#delegation-part', 'מעבר הצנרת בלבד');
  await sub.locator('section[aria-labelledby="delegation-title"] .btn--primary').click();
  await sub.waitForTimeout(2400);
  check('The delegator is told who performs', (await sub.textContent('main')).includes('הביצוע הועבר'));

  await helper.goto(`${APP}/tasks/${taskId}`, { waitUntil: 'networkidle' });
  await helper.waitForTimeout(1600);
  const helperBody = await helper.textContent('main');
  check('The delegate can open the work', (await helper.locator('#task-summary-title').count()) === 1);
  check('They see only the part handed over', helperBody.includes('מעבר הצנרת בלבד'));
  check('MUST-NOT-SEE: the project name is withheld', !helperBody.includes(PROJECT));
  check('MUST-NOT-SEE: the party above is not named', !helperBody.includes(GC.lastName));
  check('They are told they cannot hand it on again', helperBody.includes('אינה ניתנת להעברה נוספת'));
  check('And are offered no delegate control',
    (await helper.locator('#delegation-part').count()) === 0);

  await gc.goto(`${APP}/tasks/${taskId}`, { waitUntil: 'networkidle' });
  await gc.waitForTimeout(1600);
  const gcBody = await gc.textContent('main');
  check('MUST-NOT-SEE: the GC is not told the work was handed over',
    !gcBody.includes('הביצוע הועבר'));
  check('MUST-NOT-SEE: nor is the performer named', !gcBody.includes(HELPER.lastName));

  section('7. A task that is not theirs');
  await helper.goto(`${APP}/tasks/000000000000000000000000`, { waitUntil: 'networkidle' });
  await helper.waitForTimeout(1500);
  check('No detail is rendered', (await helper.locator('#task-summary-title').count()) === 0);
  check('And the screen says it was not found', (await helper.textContent('main')).includes('לא נמצאה'));

  section('8. Hebrew addresses one person');
  await sub.goto(`${APP}/tasks/${taskId}`, { waitUntil: 'networkidle' });
  await sub.waitForTimeout(1400);
  const he = await sub.textContent('main');
  const bad = FORBIDDEN_HE.filter((f) => he.includes(f));
  check('No plural-as-neutral and no slash forms', bad.length === 0, bad.join(' · '));

  section('9. Both languages at three widths');
  for (const [label, width, height] of [['desktop', 1440, 900], ['tablet', 834, 1100], ['mobile', 390, 844]]) {
    await sub.setViewportSize({ width, height });
    for (const lang of ['en', 'עב']) {
      await sub.click(`.lang-switch__btn:has-text("${lang}")`).catch(() => {});
      await sub.waitForTimeout(500);
      await sub.goto(`${APP}/tasks/${taskId}`, { waitUntil: 'networkidle' });
      await sub.waitForTimeout(1200);
      check(`${label} ${lang} — no horizontal overflow`, (await overflow(sub)) <= 0, `${await overflow(sub)}px`);
      check(`${label} ${lang} — the detail renders`, (await sub.locator('#task-summary-title').count()) === 1);
    }
  }
  await sub.setViewportSize({ width: 1440, height: 900 });

  section('10. Long content');
  await sub.goto(`${APP}/tasks/${taskId}`, { waitUntil: 'networkidle' });
  await sub.waitForTimeout(1200);
  await sub.evaluate(() => {
    const title = document.querySelector('.profile__title');
    if (title) title.textContent = 'א'.repeat(200);
  });
  await sub.setViewportSize({ width: 390, height: 844 });
  await sub.waitForTimeout(500);
  check('A 200-character title does not overflow on mobile', (await overflow(sub)) <= 0, `${await overflow(sub)}px`);

  section('11. Page errors');
  const unexpected = errors.filter((e) => !/status of 40[34]/.test(e));
  check('No uncaught page error', unexpected.length === 0, unexpected.slice(0, 2).join(' | '));

  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
