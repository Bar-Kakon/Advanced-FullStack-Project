/**
 * Real-browser proof of the coordination surface: requesting a date change from Task Detail,
 * the impact preview, the Proposal Review screen from three sides, and the privacy between them.
 *
 * Accounts are created through the API rather than the registration form, so this suite never
 * touches Google Places.
 *
 *   npm run verify:proposal-ui
 */
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'CorrectHorse42!';
const FORBIDDEN_HE = ['בחרו', 'הזינו', 'אישרתם', 'הסרתם', 'ברצונכם', 'בחר/י', 'הזן/י', 'לכם', 'שלכם', 'מוכנים'];
const ENUM_CODES = ['plans_not_ready', 'materials_not_arrived', 'gc_stop', 'proposal.launched', 'schedule.applied'];

const stamp = Date.now();
let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(66)} ${detail}`);
};
const section = (title) => console.log(`\n${title}`);

const day = (offset) => new Date(Date.UTC(2027, 8, 5) + offset * 86400000).toISOString().slice(0, 10);

const call = async (token, method, path, body) => {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text.length === 0 ? {} : JSON.parse(text) };
};

const makeAccount = async (index) => {
  const email = `prop.${index}.${stamp}@example.com`;
  const created = await call(null, 'POST', '/auth/register', {
    firstName: 'Prop', lastName: `Person${index}`, standing: 'owner',
    companyName: `Prop ${index} ${stamp} Ltd`, email,
    password: PASSWORD, confirmPassword: PASSWORD,
    registrationCategory: 'contractor', specialty: 'drilling',
    city: 'חיפה', region: 'haifa', availability: 'open',
    acceptedTerms: true, operationalEmail: true,
  });
  if (created.status !== 201) throw new Error(`register failed: ${JSON.stringify(created.body)}`);

  const signedIn = await call(null, 'POST', '/auth/login', { email, password: PASSWORD });
  return { email, token: signedIn.body.accessToken, name: `Prop Person${index}` };
};

const signIn = async (page, email) => {
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', email);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
};

const overflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const run = async () => {
  const browser = await chromium.launch();
  const contexts = await Promise.all([0, 1, 2].map(() => browser.newContext({ viewport: { width: 1440, height: 900 } })));
  const [gcPage, subPage, otherPage] = await Promise.all(contexts.map((c) => c.newPage()));

  const errors = [];
  for (const page of [gcPage, subPage, otherPage]) {
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  }

  section('1. A project with a real stage chain');
  const gc = await makeAccount(1);
  const sub = await makeAccount(2);
  const other = await makeAccount(3);

  const project = await call(gc.token, 'POST', '/projects', {
    name: `אתר תיאום ${stamp}`, startDate: day(0), targetEndDate: day(180),
    overrunAllowanceDays: 60, projectType: 'building', size: 'בניין 6 קומות',
  });
  check('The project is created', project.status === 201, project.status);
  const projectId = project.body.project.id;

  const people = await call(gc.token, 'GET', `/browse/contractors?q=Person2&limit=10`);
  const subUserId = (people.body.contractors ?? []).find((row) => row.name?.includes(`Person2`))?.userId
    ?? (people.body.contractors ?? [])[0]?.userId;
  const otherPeople = await call(gc.token, 'GET', `/browse/contractors?q=Person3&limit=10`);
  const otherUserId = (otherPeople.body.contractors ?? []).find((row) => row.name?.includes('Person3'))?.userId
    ?? (otherPeople.body.contractors ?? [])[0]?.userId;

  for (const [userId, token] of [[subUserId, sub.token], [otherUserId, other.token]]) {
    const invited = await call(gc.token, 'POST', `/projects/${projectId}/members`, {
      userId, projectRole: 'subcontractor',
    });
    await call(token, 'POST', `/project-invitations/${invited.body.member.id}/accept`);
  }

  const s1 = await call(gc.token, 'POST', `/projects/${projectId}/stages`, { name: 'יסודות', isGate: true });
  const s2 = await call(gc.token, 'POST', `/projects/${projectId}/stages`, { name: 'שלד', isGate: false });
  await call(gc.token, 'PATCH', `/projects/${projectId}/stages/${s2.body.stage._id}/dependencies`, {
    dependsOn: [s1.body.stage._id],
  });

  const t1 = await call(gc.token, 'POST', '/tasks', {
    kind: 'project', title: 'יציקת יסודות', projectId, stageId: s1.body.stage._id,
    assigneeId: subUserId, startDate: day(1), dueDate: day(7),
  });
  const t2 = await call(gc.token, 'POST', '/tasks', {
    kind: 'project', title: 'שלד קומה 1', projectId, stageId: s2.body.stage._id,
    assigneeId: otherUserId, startDate: day(8), dueDate: day(15),
  });
  check('Two pieces of work exist across two stages', t1.status === 201 && t2.status === 201,
    `${t1.status}/${t2.status}`);
  const taskId = t1.body.task.id;

  section('2. Task Detail offers the real request, not a placeholder');
  await signIn(subPage, sub.email);
  await subPage.goto(`${APP}/tasks/${taskId}`, { waitUntil: 'networkidle' });
  await subPage.waitForTimeout(1500);

  const detailText = await subPage.textContent('main');
  check('The unavailable notice is gone', !detailText.includes('עדיין לא נבנה'));
  check('The date-change panel is there', (await subPage.locator('#date-change-title').count()) === 1);
  check('It says a request does not move the schedule by itself',
    detailText.includes('אינה משנה את הלוח בעצמה'));
  check('And it states the real reach of a change here', /נוגע(ת)? גם ב־\d|אינו נוגע/.test(detailText));

  section('3. The impact preview runs before anything is sent');
  await subPage.fill('.date-change input[type="number"]', '6');
  await subPage.click('.date-change__actions .btn--ghost');
  await subPage.waitForTimeout(1800);
  const previewText = await subPage.textContent('.date-change__preview');
  check('The preview reports the work it touches', /עבודות מושפעות: \d/.test(previewText), previewText?.trim());
  check('And how many other professionals would be asked',
    /בעלי מקצוע נוספים שיישאלו: \d/.test(previewText));
  check('The requester is not shown another professional name',
    !previewText.includes('Person3'));

  section('4. The request is sent and reaches a real proposal');
  await subPage.click('.date-change__actions .btn--primary');
  await subPage.waitForTimeout(2000);
  const sentText = await subPage.textContent('main');
  check('The screen confirms it was sent', sentText.includes('הבקשה נשלחה'));
  const proposalLink = subPage.locator('a[href^="/proposals/"]');
  check('And links to the request', (await proposalLink.count()) >= 1);
  const proposalHref = await proposalLink.first().getAttribute('href');
  const proposalId = proposalHref.split('/proposals/')[1];

  section('5. The requester sees their own request and nothing else');
  await subPage.goto(`${APP}${proposalHref}`, { waitUntil: 'networkidle' });
  await subPage.waitForTimeout(1500);
  const requesterView = await subPage.textContent('main');
  check('The status is shown in words', requesterView.includes('ממתין להפעלה'));
  check('With the rule stated plainly', requesterView.includes('אף לוח זמנים לא זז'));
  check('No other professional is named', !requesterView.includes('Person3'));
  check('And no response matrix is offered', (await subPage.locator('.prop-decisions').count()) === 0);

  section('6. Only the schedule authority can launch it');
  await signIn(gcPage, gc.email);
  await gcPage.goto(`${APP}/proposals/${proposalId}`, { waitUntil: 'networkidle' });
  await gcPage.waitForTimeout(1500);
  check('The authority sees the impact table', (await gcPage.locator('.prop-table').count()) === 1);
  check('Including the professional column',
    (await gcPage.locator('.prop-table th').allTextContents()).some((h) => h.includes('בעל מקצוע')));

  const launchButton = gcPage.locator('button:has-text("הפעלת הבקשה")');
  check('The launch control is offered here', (await launchButton.count()) === 1);
  await launchButton.click();
  await gcPage.waitForTimeout(2000);
  check('And the request opens for responses',
    (await gcPage.textContent('main')).includes('פתוח לתגובות'));

  section('7. The affected professional answers for their own work only');
  await signIn(otherPage, other.email);
  await otherPage.goto(`${APP}/proposals/${proposalId}`, { waitUntil: 'networkidle' });
  await otherPage.waitForTimeout(1500);
  const otherView = await otherPage.textContent('main');
  check('They can see the request', otherView.includes('בקשת שינוי לוח זמנים'));
  check('They are told other responses are not shown', otherView.includes('אינן מוצגות כאן'));
  check('They see exactly one row of work', (await otherPage.locator('.prop-table tbody tr').count()) === 1);
  check('And no resolve control', (await otherPage.locator('.prop-decisions').count()) === 0);

  await otherPage.locator('.prop-answer button').first().click();
  await otherPage.waitForTimeout(600);
  check('Three real answers are offered',
    (await otherPage.locator('.prop-modes .perm-check').count()) === 3);
  await otherPage.locator('.prop-modes input[type="radio"]').nth(1).check();
  await otherPage.waitForTimeout(400);
  const reasons = await otherPage.locator('.prop-answer select option').allTextContents();
  check('Decline reasons are shown in words, never as codes',
    reasons.length >= 8 && !reasons.some((r) => ENUM_CODES.some((code) => r.includes(code))),
    reasons.join(' | '));
  await otherPage.locator('.prop-answer select').selectOption('materials_not_arrived');
  await otherPage.locator('.prop-answer button:has-text("שליחת התגובה")').click();
  await otherPage.waitForTimeout(2000);
  check('The response is recorded',
    (await otherPage.textContent('main')).includes('נדחה'));

  section('8. The decision stays with the authority');
  await gcPage.reload({ waitUntil: 'networkidle' });
  await gcPage.waitForTimeout(1500);
  const gcAfter = await gcPage.textContent('main');
  check('The authority sees the decline', gcAfter.includes('נדחה'));
  check('And the reason behind it', gcAfter.includes('חומרים שלא הגיעו'));
  check('The proposal has not resolved itself', gcAfter.includes('פתוח לתגובות'));
  check('A decision control is offered', (await gcPage.locator('.prop-decisions').count()) === 1);

  await subPage.reload({ waitUntil: 'networkidle' });
  await subPage.waitForTimeout(1500);
  const requesterAfter = await subPage.textContent('main');
  check('The requester is never told who declined or why',
    !requesterAfter.includes('חומרים שלא הגיעו') && !requesterAfter.includes('Person3'));

  section('9. An unrelated address answers as a missing request');
  await otherPage.goto(`${APP}/proposals/000000000000000000000000`, { waitUntil: 'networkidle' });
  await otherPage.waitForTimeout(1500);
  check('It says the request is not available',
    (await otherPage.textContent('main')).includes('אינה זמינה'));

  section('10. The project dashboard carries the coordination surface');
  await gcPage.goto(`${APP}/projects/${projectId}`, { waitUntil: 'networkidle' });
  await gcPage.waitForTimeout(2000);
  const dashText = await gcPage.textContent('main');
  check('The coordination panel is there', dashText.includes('תיאום ולוח זמנים'));
  check('With a real open count', /בקשות פתוחות: [1-9]/.test(dashText));
  check('The project history is there', dashText.includes('היסטוריית הפרויקט'));
  check('Written in words rather than action codes',
    dashText.includes('הוגשה בקשה לשינוי תאריך') && !ENUM_CODES.some((code) => dashText.includes(code)));

  section('11. Hebrew addresses one person');
  const he = await gcPage.textContent('main');
  const bad = FORBIDDEN_HE.filter((word) => he.includes(word));
  check('No plural-as-neutral and no slash forms', bad.length === 0, bad.join(' · '));

  section('12. Both languages at three widths');
  for (const [label, width, height] of [['desktop', 1440, 900], ['tablet', 834, 1100], ['mobile', 390, 844]]) {
    await gcPage.setViewportSize({ width, height });
    for (const lang of ['en', 'עב']) {
      await gcPage.click(`.lang-switch__btn:has-text("${lang}")`).catch(() => {});
      await gcPage.waitForTimeout(400);
      await gcPage.goto(`${APP}/proposals/${proposalId}`, { waitUntil: 'networkidle' });
      await gcPage.waitForTimeout(1400);

      const dir = await gcPage.evaluate(() => document.documentElement.getAttribute('dir'));
      check(`${label} ${lang} — the document direction matches the language`,
        dir === (lang === 'en' ? 'ltr' : 'rtl'), String(dir));
      check(`${label} ${lang} — no horizontal overflow`, (await overflow(gcPage)) <= 0, `${await overflow(gcPage)}px`);
      check(`${label} ${lang} — the review renders`, (await gcPage.locator('.prop-table').count()) === 1);
    }
  }
  await gcPage.click('.lang-switch__btn:has-text("en")').catch(() => {});
  await gcPage.waitForTimeout(400);
  await gcPage.goto(`${APP}/proposals/${proposalId}`, { waitUntil: 'networkidle' });
  await gcPage.waitForTimeout(1400);
  const english = await gcPage.textContent('main');
  check('The English copy is complete', english.includes('Schedule change request')
    && english.includes('Materials have not arrived'), '');
  const HE_UI = ['בקשת שינוי לוח זמנים', 'חומרים שלא הגיעו', 'בעל מקצוע', 'פתוח לתגובות'];
  check('And no Hebrew interface string is left behind',
    !HE_UI.some((word) => english.includes(word)),
    HE_UI.filter((word) => english.includes(word)).join(' · '));
  check('While user-written Hebrew is shown exactly as it was written, not translated',
    english.includes('יציקת יסודות'));
  const autoDirs = await gcPage.locator('.prop-table td[dir="auto"]').count();
  check('and is rendered with its own direction resolved per string', autoDirs >= 1, String(autoDirs));

  await gcPage.setViewportSize({ width: 1440, height: 900 });

  section('13. Page errors');
  const unexpected = errors.filter((e) => !/status of 40[34]/.test(e));
  check('No uncaught page error', unexpected.length === 0, unexpected.slice(0, 2).join(' | '));

  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
