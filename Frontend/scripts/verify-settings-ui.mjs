/**
 * Real-browser proof of Settings, the notification centre and the schedule-exception screen.
 *
 * Two accounts so the exception flow has a submitter and an approver, and every screen is checked
 * in both languages: Hebrew is the default and English is complete.
 *
 *   npm run verify:settings-ui
 */
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'CorrectHorse42!';
/** Plural forms and slashed pairs are not how the product addresses one person. */
const FORBIDDEN_HE = ['בחרו', 'הזינו', 'אישרתם', 'הסרתם', 'ברצונכם', 'בחר/י', 'הזן/י', 'לכם', 'שלכם'];

const stamp = Date.now();
const GC = { firstName: 'Gc', lastName: `Set${stamp}`, companyName: `GC Set ${stamp}`, email: `set.gc.${stamp}@example.com` };
const SUB = { firstName: 'Sub', lastName: `Set${stamp}`, companyName: `Sub Set ${stamp}`, email: `set.sub.${stamp}@example.com` };
const PROJECT = `אתר הגדרות ${stamp}`;

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(70)} ${detail}`);
};
const section = (t) => console.log(`\n${t}`);
const day = (o) => new Date(Date.UTC(2027, 5, 1) + o * 86400000).toISOString().slice(0, 10);

/**
 * The token is read out of the browser session rather than fetched with a second login.
 *
 * Login is rate limited to ten attempts a quarter hour — correctly — so a suite that logs in twice
 * per account exhausts the limit on its third run and fails for a reason that has nothing to do
 * with what it tests.
 */
const tokenFrom = (page) =>
  page.evaluate(() => localStorage.getItem('fieldsync-access-token'));
const apiCall = (token, method, path, body) =>
  fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

/**
 * Accounts are created through the API rather than the Register screen.
 *
 * Register's city field is a Google Places picker, and the key in this environment is restricted
 * by HTTP referrer — so driving that form would make this suite depend on an external service that
 * has nothing to do with Settings, Notifications, exceptions or Edit Task. The session is still
 * established through the real Login form, so the screens under test run against a genuine one.
 */
const register = async (page, who) => {
  const created = await fetch(`${API}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: who.firstName,
      lastName: who.lastName,
      standing: 'owner',
      companyName: who.companyName,
      email: who.email,
      password: PASSWORD,
      confirmPassword: PASSWORD,
      registrationCategory: 'contractor',
      specialty: 'electrical',
      city: 'חיפה',
      region: 'haifa',
      availability: 'open',
      acceptedTerms: true,
      operationalEmail: true,
    }),
  });
  if (created.status !== 201) throw new Error(`Register failed: ${await created.text()}`);

  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', who.email);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  return tokenFrom(page);
};

const overflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const switchLanguage = async (page, to) => {
  await page.evaluate((lang) => localStorage.setItem('fieldsync-lang', lang), to);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
};

const run = async () => {
  const browser = await chromium.launch();
  const ctxs = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 1440, height: 900 } })));
  const [gc, sub] = await Promise.all(ctxs.map((c) => c.newPage()));

  const errors = [];
  for (const page of [gc, sub]) {
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  }

  section('1. Two accounts and one project');
  const gcToken = await register(gc, GC);
  const subToken = await register(sub, SUB);
  check('Both sessions carry a token', typeof gcToken === 'string' && typeof subToken === 'string');

  // Built through the API for the same reason accounts are: the project form carries a Places
  // picker, and this suite is about the four screens below it.
  const madeProject = await apiCall(gcToken, 'POST', '/projects', {
    name: PROJECT, startDate: day(0), targetEndDate: day(90),
    overrunAllowanceDays: 10, projectType: 'building', size: 'בניין 6 קומות',
  });
  const projectBody = await madeProject.json();
  if (madeProject.status !== 201) throw new Error(`Project failed ${madeProject.status}: ${JSON.stringify(projectBody)}`);
  const projectId = projectBody.project.id;
  check('A project exists', typeof projectId === 'string' && projectId.length === 24, projectId);

  const people = await apiCall(gcToken, 'GET', `/browse/contractors?q=${encodeURIComponent(SUB.lastName)}&limit=5`);
  const subUserId = (await people.json()).contractors[0].userId;
  const invited = await apiCall(gcToken, 'POST', `/projects/${projectId}/members`, {
    userId: subUserId, projectRole: 'subcontractor',
  });
  const membershipId = (await invited.json()).member.id;
  await apiCall(subToken, 'POST', `/project-invitations/${membershipId}/accept`);

  section('2. The navbar bell is a destination, not a disabled control');
  await sub.goto(`${APP}/dashboard`, { waitUntil: 'networkidle' });
  const bell = sub.locator('.nav-icon-btn');
  check('The bell is rendered', (await bell.count()) > 0);
  check('It is not disabled', (await sub.locator('button.nav-icon-btn[disabled]').count()) === 0);
  const badge = sub.locator('.nav-badge');
  check('An unread invitation shows a count', (await badge.count()) === 1,
    await badge.textContent().catch(() => ''));

  await bell.first().click();
  await sub.waitForTimeout(1200);
  check('The bell reaches the notification centre', sub.url().includes('/notifications'), sub.url());

  section('3. The notification centre renders the real row');
  const notifText = await sub.textContent('main');
  check('The invitation is listed', notifText.includes('הזמנה לפרויקט'));
  check('And it is marked as waiting on the reader', notifText.includes('ממתין לתשובה'));
  check('One status concept only — no separate read and dismissed labels',
    !notifText.includes('נמחק') && !notifText.includes('בוטלה ההתראה'));
  check('No horizontal overflow', (await overflow(sub)) <= 0, await overflow(sub));

  const unreadRows = await sub.locator('.notif-row--unread').count();
  check('The row reads as unread', unreadRows >= 1, unreadRows);
  await sub.locator('.notif-row--unread .btn--ghost').first().click();
  await sub.waitForTimeout(1200);
  check('Marking it seen clears the unread treatment',
    (await sub.locator('.notif-row--unread').count()) < unreadRows);

  section('4. Settings is reachable from the account menu');
  await sub.goto(`${APP}/dashboard`, { waitUntil: 'networkidle' });
  await sub.locator('.nav-profile').click();
  await sub.waitForTimeout(500);
  const settingsItem = sub.locator('#account-menu li', { hasText: 'הגדרות' });
  check('The Settings entry is not disabled',
    (await sub.locator('#account-menu li[aria-disabled="true"]').count()) === 0);
  await settingsItem.first().click();
  await sub.waitForTimeout(1500);
  check('It opens Settings', sub.url().includes('/settings'), sub.url());

  section('5. Settings is grouped, and states what a plan does not include');
  const settingsText = await sub.textContent('main');
  for (const heading of ['שפת הממשק', 'התראות', 'פרטי קשר בפרופיל', 'פרויקטים מושתקים', 'תוכנית ומנוי', 'החשבון']) {
    check(`Section present: ${heading}`, settingsText.includes(heading));
  }
  check('The 90-minute rule is stated', settingsText.includes('90 דקות'));
  check('Operational email is described as optional', settingsText.includes('אופציונלי לחלוטין'));
  check('And separated from marketing', settingsText.includes('אינה הרשמה לדיוור שיווקי'));
  check('A personal phone is stated never to be shown', settingsText.includes('טלפון אישי לא מוצג'));
  check('A connection is stated to reveal nothing', settingsText.includes('קשר ברשת אינו חושף'));
  check('Free is told the timing controls are not included',
    settingsText.includes('אינה כלולה בתוכנית הנוכחית'));
  check('Deactivation states the 60-day lifecycle', settingsText.includes('60 יום'));
  check('And says why it cannot be raised yet', settingsText.includes('טרם נסגר'));
  check('No dead control is drawn',
    (await sub.locator('main button[disabled]:not(.btn--primary)').count()) === 0);
  check('No horizontal overflow', (await overflow(sub)) <= 0, await overflow(sub));

  section('6. A preference actually persists');
  const emailBox = sub.locator('.settings-choice input[type="checkbox"]').first();
  const before = await emailBox.isChecked();
  await emailBox.click();
  await sub.waitForTimeout(1400);
  await sub.reload({ waitUntil: 'networkidle' });
  await sub.waitForTimeout(1200);
  const after = await sub.locator('.settings-choice input[type="checkbox"]').first().isChecked();
  check('The opt-in survives a reload', after !== before, `${before} → ${after}`);

  section('7. The exceptions screen refuses to invent a holiday');
  await sub.goto(`${APP}/projects/${projectId}/schedule-exceptions`, { waitUntil: 'networkidle' });
  await sub.waitForTimeout(1200);
  const excText = await sub.textContent('main');
  check('The screen loads', excText.includes('חריגים בלוח הזמנים'));
  check('It says no holiday source is approved', excText.includes('אין מקור נתונים מאושר לחגים'));
  check('Both directions are offered',
    excText.includes('יום שלא ייעבד') && excText.includes('יום עבודה חריג'));
  check('The request is stated to be for the submitter alone', excText.includes('עבורך בלבד'));
  check('A subcontractor is not offered the project-wide scope',
    !(await sub.locator('#exc-scope option[value="project"]').count()));
  check('No horizontal overflow', (await overflow(sub)) <= 0, await overflow(sub));

  section('8. A request travels, and the approver sees the history');
  await sub.fill('#exc-from', day(10));
  await sub.fill('#exc-to', day(10));
  await sub.fill('#exc-reason', 'מילואים');
  await sub.locator('.exc-panel .btn--primary').first().click();
  await sub.waitForTimeout(1800);
  const afterSubmit = await sub.textContent('main');
  check('The request is listed as waiting', afterSubmit.includes('ממתין לאישור'));
  check('And the history carries the first line', afterSubmit.includes('היסטוריית הבקשה'));

  await gc.goto(`${APP}/projects/${projectId}/schedule-exceptions`, { waitUntil: 'networkidle' });
  await gc.waitForTimeout(1200);
  const approverText = await gc.textContent('main');
  check('The approver sees the request', approverText.includes('ממתין לאישור'));
  check('And is told an approval ends the matter', approverText.includes('מסיים את העניין'));
  check('The approver is offered the project-wide scope',
    (await gc.locator('#exc-scope option[value="project"]').count()) === 1);

  await gc.locator('.exc-row .btn--primary').first().click();
  await gc.waitForTimeout(1800);
  check('Approving records the decision', (await gc.textContent('main')).includes('אושר'));

  section('9. Edit Task shows the boundary rather than a control that would fail');
  const stageBody = await apiCall(gcToken, 'GET', `/projects/${projectId}/stages`);
  let stages = (await stageBody.json()).stages;
  if (stages.length === 0) {
    await apiCall(gcToken, 'POST', `/projects/${projectId}/stages`, { name: 'שלד', isGate: false });
    stages = (await (await apiCall(gcToken, 'GET', `/projects/${projectId}/stages`)).json()).stages;
  }
  // The stages read is a lean projection, so the identifier arrives as `_id`.
  const stageId = stages[0]._id ?? stages[0].id;
  const madeTask = await apiCall(gcToken, 'POST', '/tasks', {
    kind: 'project', projectId, stageId, title: 'יציקה',
    assigneeId: subUserId, startDate: day(4), dueDate: day(8),
  });
  const taskId = (await madeTask.json()).task.id;

  await gc.goto(`${APP}/tasks/${taskId}/edit`, { waitUntil: 'networkidle' });
  await gc.waitForTimeout(1400);
  const editText = await gc.textContent('main');
  check('Edit Task opens', editText.includes('עריכת משימה'));
  check('It reuses the Create Task vocabulary', editText.includes('שם המשימה'));
  check('Dates are stated to go through coordination', editText.includes('תיאום המועדים'));
  check('No date input is drawn on project work',
    (await gc.locator('#edit-start').count()) === 0 && (await gc.locator('#edit-due').count()) === 0);
  check('Responsibility is stated to move elsewhere', editText.includes('העברת אחריות מתבצעת'));
  check('No horizontal overflow', (await overflow(gc)) <= 0, await overflow(gc));

  await gc.fill('#edit-title', 'יציקת קומה א');
  await gc.locator('.settings-actions .btn--primary').click();
  await gc.waitForTimeout(1600);
  check('A non-schedule edit saves', (await gc.textContent('main')).includes('השינויים נשמרו'));

  section('10. English is complete and the layout mirrors');
  for (const [page, path] of [
    [sub, '/settings'],
    [sub, '/notifications'],
    [sub, `/projects/${projectId}/schedule-exceptions`],
    [gc, `/tasks/${taskId}/edit`],
  ]) {
    await page.goto(`${APP}${path}`, { waitUntil: 'networkidle' });
    await switchLanguage(page, 'en');
    const dir = await page.evaluate(() => document.documentElement.dir);
    const text = await page.textContent('main');
    check(`${path}: direction is ltr in English`, dir === 'ltr', dir);
    // A person's own data reads the same in both languages, so it is removed before the check:
    // what must not appear is Hebrew INTERFACE copy.
    const withoutData = [PROJECT, 'יציקה', 'יציקת קומה א', 'מילואים', 'שלד']
      .reduce((acc, value) => acc.split(value).join(''), text);
    check(`${path}: no Hebrew interface copy leaks into English`, !/[֐-׿]/.test(withoutData),
      (withoutData.match(/[֐-׿]+/g) ?? []).slice(0, 3).join(' | '));
    check(`${path}: no horizontal overflow`, (await overflow(page)) <= 0, await overflow(page));
    await switchLanguage(page, 'he');
    check(`${path}: direction returns to rtl`,
      (await page.evaluate(() => document.documentElement.dir)) === 'rtl');
  }

  section('11. Hebrew addresses one person');
  for (const path of ['/settings', '/notifications', `/projects/${projectId}/schedule-exceptions`]) {
    await sub.goto(`${APP}${path}`, { waitUntil: 'networkidle' });
    await sub.waitForTimeout(900);
    const text = await sub.textContent('main');
    const found = FORBIDDEN_HE.filter((word) => text.includes(word));
    check(`${path}: no plural or slashed address`, found.length === 0, found.join(', '));
  }

  section('12. Narrow viewport');
  const small = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const phone = await small.newPage();
  // The session is copied rather than signed in again, for the rate-limit reason above.
  await phone.goto(`${APP}/`, { waitUntil: 'networkidle' });
  await phone.evaluate((token) => localStorage.setItem('fieldsync-access-token', token), subToken);
  for (const path of ['/settings', '/notifications']) {
    await phone.goto(`${APP}${path}`, { waitUntil: 'networkidle' });
    await phone.waitForTimeout(900);
    check(`${path}: no overflow at 390px`, (await overflow(phone)) <= 0, await overflow(phone));
  }
  await small.close();

  section('13. No console errors');
  const real = errors.filter((e) => !e.includes('favicon') && !e.includes('404 (Not Found)'));
  check('The pages raised no script error', real.length === 0, real.slice(0, 3).join(' | '));

  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
