/**
 * Real-browser proof of the Stage graph authoring surface and the Project mute control.
 *
 * Accounts are created through the API, so this suite never touches Google Places.
 *
 *   npm run verify:stage-graph-ui
 */
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'CorrectHorse42!';
const FORBIDDEN_HE = ['בחרו', 'הזינו', 'אישרתם', 'הסרתם', 'ברצונכם', 'בחר/י', 'הזן/י', 'לכם', 'שלכם'];

const stamp = Date.now();
let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(66)} ${detail}`);
};
const section = (title) => console.log(`\n${title}`);
const day = (offset) => new Date(Date.UTC(2027, 10, 7) + offset * 86400000).toISOString().slice(0, 10);

const call = async (token, method, path, body) => {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text.length === 0 ? {} : JSON.parse(text) };
};

const makeAccount = async (index) => {
  const email = `stage.${index}.${stamp}@example.com`;
  const created = await call(null, 'POST', '/auth/register', {
    firstName: 'Stage', lastName: `Person${index}`, standing: 'owner',
    companyName: `Stage ${index} ${stamp} Ltd`, email,
    password: PASSWORD, confirmPassword: PASSWORD,
    registrationCategory: 'contractor', specialty: 'drilling',
    city: 'חיפה', region: 'haifa', availability: 'open',
    acceptedTerms: true, operationalEmail: true,
  });
  if (created.status !== 201) throw new Error(`register failed: ${JSON.stringify(created.body)}`);
  const signedIn = await call(null, 'POST', '/auth/login', { email, password: PASSWORD });
  return { email, token: signedIn.body.accessToken };
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
  const contexts = await Promise.all([0, 1].map(() => browser.newContext({ viewport: { width: 1440, height: 900 } })));
  const [gcPage, subPage] = await Promise.all(contexts.map((c) => c.newPage()));

  const errors = [];
  for (const page of [gcPage, subPage]) {
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  }

  section('1. A project with two members');
  const gc = await makeAccount(1);
  const sub = await makeAccount(2);

  const project = await call(gc.token, 'POST', '/projects', {
    name: `אתר שלבים ${stamp}`, startDate: day(0), targetEndDate: day(150),
    overrunAllowanceDays: 40, projectType: 'building', size: 'בניין 4 קומות',
  });
  check('The project is created', project.status === 201, project.status);
  const projectId = project.body.project.id;

  const people = await call(gc.token, 'GET', '/browse/contractors?q=Person2&limit=10');
  const subUserId = (people.body.contractors ?? [])[0]?.userId;
  const invited = await call(gc.token, 'POST', `/projects/${projectId}/members`, {
    userId: subUserId, projectRole: 'subcontractor',
  });
  await call(sub.token, 'POST', `/project-invitations/${invited.body.member.id}/accept`);

  section('2. The authoring surface is reachable from the project');
  await signIn(gcPage, gc.email);
  await gcPage.goto(`${APP}/projects/${projectId}`, { waitUntil: 'networkidle' });
  await gcPage.waitForTimeout(2000);
  const entry = gcPage.locator(`a[href="/projects/${projectId}/stages"]`);
  check('The project dashboard links to it', (await entry.count()) === 1);
  await entry.click();
  await gcPage.waitForTimeout(1800);
  check('It opens the stage route', gcPage.url().endsWith('/stages'), gcPage.url());

  const empty = await gcPage.textContent('main');
  check('An empty project says so', empty.includes('עדיין לא הוגדרו שלבים'));
  check('And states that the dependency is between stages, not tasks',
    empty.includes('בין שלבים שלמים, לא בין משימות בודדות'));

  section('3. Stages are created, including the blocking kind');
  const addName = gcPage.locator('.panel input.input').last();
  await addName.fill('יסודות');
  await gcPage.locator('.perm-check input[type="checkbox"]').check();
  await gcPage.locator('button:has-text("הוספת שלב")').click();
  await gcPage.waitForTimeout(1800);
  check('The first stage is created', (await gcPage.locator('.stage-item').count()) === 1);
  check('And it is marked as the blocking kind',
    (await gcPage.textContent('.stage-item')).includes('שלב חוסם'));

  await gcPage.locator('.panel input.input').last().fill('שלד');
  await gcPage.locator('button:has-text("הוספת שלב")').click();
  await gcPage.waitForTimeout(1800);
  await gcPage.locator('.panel input.input').last().fill('חשמל');
  await gcPage.locator('button:has-text("הוספת שלב")').click();
  await gcPage.waitForTimeout(1800);
  check('Three stages exist', (await gcPage.locator('.stage-item').count()) === 3);

  section('4. Dependencies are added and removed');
  const second = gcPage.locator('.stage-item').nth(1);
  check('A stage starts depending on nothing',
    (await second.textContent()).includes('אינו תלוי בשלב אחר'));

  await second.locator('select').selectOption({ label: 'יסודות' });
  await gcPage.waitForTimeout(1800);
  const afterDependency = await gcPage.locator('.stage-item').nth(1).textContent();
  check('The dependency is shown by name, never as an id',
    afterDependency.includes('תלוי בשלבים') && afterDependency.includes('יסודות'));
  check('And no raw identifier is rendered', !/[0-9a-f]{24}/.test(afterDependency));

  await gcPage.locator('.stage-item').nth(1).locator('button:has-text("הסרת התלות")').click();
  await gcPage.waitForTimeout(1800);
  check('It can be removed again',
    (await gcPage.locator('.stage-item').nth(1).textContent()).includes('אינו תלוי בשלב אחר'));

  section('5. A cycle is refused in words a person can read');
  await gcPage.locator('.stage-item').nth(1).locator('select').selectOption({ label: 'יסודות' });
  await gcPage.waitForTimeout(1800);
  const firstStage = gcPage.locator('.stage-item').nth(0);
  const options = await firstStage.locator('select option').allTextContents();
  check('The picker still offers the downstream stage, so the rule is enforced by the server',
    options.some((option) => option.includes('שלד')));
  await firstStage.locator('select').selectOption({ label: 'שלד' });
  await gcPage.waitForTimeout(1800);
  const cycleText = await gcPage.textContent('main');
  check('The loop is refused with a human sentence', cycleText.includes('יוצרת מעגל'));
  check('And nothing silently changed',
    (await gcPage.locator('.stage-item').nth(0).textContent()).includes('אינו תלוי בשלב אחר'));

  section('6. Display order is separate from the dependency');
  check('The screen says so', (await gcPage.textContent('main')).includes('סדר התצוגה אינו התלות'));
  const before = await gcPage.locator('.stage-item__name').allTextContents();
  await gcPage.locator('.stage-item').nth(1).locator('button:has-text("העלאה")').click();
  await gcPage.waitForTimeout(2000);
  const after = await gcPage.locator('.stage-item__name').allTextContents();
  check('Moving a stage changes the display order', before.join('|') !== after.join('|'),
    `${before.join('|')} → ${after.join('|')}`);

  const stages = await call(gc.token, 'GET', `/projects/${projectId}/stages`);
  const moved = (stages.body.stages ?? []).find((row) => row.name === 'שלד');
  check('And the dependency it carries is untouched by the move',
    (moved?.dependsOn ?? []).length === 1, `${(moved?.dependsOn ?? []).length}`);

  section('7. Gate can be turned on and off');
  const gateButton = gcPage.locator('.stage-item').nth(0).locator('button:has-text("שלב")').last();
  await gateButton.click();
  await gcPage.waitForTimeout(1800);
  check('The kind is editable', (await gcPage.textContent('main')).includes('שלב רגיל'));

  section('8. An ordinary member sees the graph and cannot edit it');
  await signIn(subPage, sub.email);
  await subPage.goto(`${APP}/projects/${projectId}/stages`, { waitUntil: 'networkidle' });
  await subPage.waitForTimeout(2000);
  const memberView = await subPage.textContent('main');
  check('They can read it', (await subPage.locator('.stage-item').count()) >= 3);
  check('They are told it is read-only', memberView.includes('התצוגה בלבד'));
  check('No add control is offered', (await subPage.locator('button:has-text("הוספת שלב")').count()) === 0);
  check('No dependency picker is offered', (await subPage.locator('.stage-item select').count()) === 0);

  const refused = await call(sub.token, 'POST', `/projects/${projectId}/stages`, { name: 'x', isGate: false });
  check('And the server refuses them regardless of the screen', refused.status === 403, refused.status);

  section('9. Project mute is a real, stored, per-viewer preference');
  await subPage.goto(`${APP}/projects/${projectId}`, { waitUntil: 'networkidle' });
  await subPage.waitForTimeout(2200);
  const muteText = await subPage.textContent('main');
  check('The control is on the project dashboard', muteText.includes('התראות הפרויקט'));
  check('It says what muting does not change',
    muteText.includes('אינה משנה חברות בפרויקט'));
  check('And it does not claim notifications are delivered yet',
    muteText.includes('מנגנון ההתראות עצמו עדיין לא נבנה'));

  const muteButton = subPage.locator('button:has-text("השתקת הפרויקט")');
  check('The state is shown in words, not by colour alone',
    (await subPage.locator('.mute-state .prop-chip').textContent()).trim().length > 0);
  await muteButton.click();
  await subPage.waitForTimeout(1800);
  check('Muting flips the state', (await subPage.textContent('.mute-state')).includes('מושתק'));

  await subPage.reload({ waitUntil: 'networkidle' });
  await subPage.waitForTimeout(2200);
  check('And it survives a reload, because it is stored on the server',
    (await subPage.textContent('.mute-state')).includes('מושתק'));

  const gcMute = await call(gc.token, 'GET', `/mutes/projects/${projectId}`);
  check('Another member is unaffected', gcMute.body.mute.muted === false, JSON.stringify(gcMute.body.mute));

  await subPage.locator('button:has-text("ביטול ההשתקה")').click();
  await subPage.waitForTimeout(1800);
  check('And it can be turned off again', (await subPage.textContent('.mute-state')).includes('פעיל'));

  section('10. Hebrew addresses one person');
  const he = await gcPage.textContent('main');
  const bad = FORBIDDEN_HE.filter((word) => he.includes(word));
  check('No plural-as-neutral and no slash forms', bad.length === 0, bad.join(' · '));

  section('11. Both languages at three widths');
  for (const [label, width, height] of [['desktop', 1440, 900], ['tablet', 834, 1100], ['mobile', 390, 844]]) {
    await gcPage.setViewportSize({ width, height });
    for (const lang of ['en', 'עב']) {
      await gcPage.click(`.lang-switch__btn:has-text("${lang}")`).catch(() => {});
      await gcPage.waitForTimeout(400);
      await gcPage.goto(`${APP}/projects/${projectId}/stages`, { waitUntil: 'networkidle' });
      await gcPage.waitForTimeout(1600);

      const dir = await gcPage.evaluate(() => document.documentElement.getAttribute('dir'));
      check(`${label} ${lang} — direction matches the language`, dir === (lang === 'en' ? 'ltr' : 'rtl'), String(dir));
      check(`${label} ${lang} — no horizontal overflow`, (await overflow(gcPage)) <= 0, `${await overflow(gcPage)}px`);
      check(`${label} ${lang} — the stages render`, (await gcPage.locator('.stage-item').count()) >= 3);
    }
  }

  await gcPage.click('.lang-switch__btn:has-text("en")').catch(() => {});
  await gcPage.waitForTimeout(400);
  await gcPage.goto(`${APP}/projects/${projectId}/stages`, { waitUntil: 'networkidle' });
  await gcPage.waitForTimeout(1600);
  const english = await gcPage.textContent('main');
  check('The English copy is complete', english.includes('Project stages and the dependencies'));
  check('And no Hebrew interface string is left behind',
    !english.includes('סדר התצוגה אינו התלות') && !english.includes('שלב חוסם'));
  check('While user-written stage names stay exactly as written', english.includes('יסודות'));

  await gcPage.setViewportSize({ width: 1440, height: 900 });

  section('12. Page errors');
  const unexpected = errors.filter((e) => !/status of 40[0349]/.test(e));
  check('No uncaught page error', unexpected.length === 0, unexpected.slice(0, 2).join(' | '));

  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
