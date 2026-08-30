/**
 * Real-browser proof of Open work (approved screen #17, create) against the real API.
 *
 * Three accounts: a GC who holds Full Project Authority, a member granted only `task.create`, and
 * a member granted nothing. Every fixture is made through the interface itself — this is the screen
 * that makes work, so nothing here is seeded behind its back.
 *
 *   npm run verify:create-task-ui
 */
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'CorrectHorse42!';
const FORBIDDEN_HE = ['בחרו', 'הזינו', 'אישרתם', 'הסרתם', 'ברצונכם', 'בחר/י', 'הזן/י', 'לכם', 'שלכם'];

const stamp = Date.now();
const account = (role) => ({
  firstName: 'Create',
  lastName: `${role}${stamp}`,
  companyName: `${role} Co ${stamp}`,
  email: `create.${role.toLowerCase()}.${stamp}@example.com`,
});
const GC = account('Gc');
const CREATOR = account('Creator');
const PLAIN = account('Plain');

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(66)} ${detail}`);
};
const section = (t) => console.log(`\n${t}`);

const day = (o) => new Date(Date.UTC(2027, 4, 3) + o * 86400000).toISOString().slice(0, 10);

const tokenFor = async (who) => {
  const r = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: who.email, password: PASSWORD }),
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

/**
 * Puts somebody on the project with an exact permission set. Done through the API, as the sibling
 * suites do: the subject here is Open work, and driving another screen's form to reach it would
 * make this suite fail for reasons that have nothing to do with what it tests.
 */
const enrol = async (gcToken, guestToken, projectId, guestAccount, permissions) => {
  const found = await apiCall(
    gcToken,
    'GET',
    `/browse/contractors?q=${encodeURIComponent(guestAccount.lastName)}&limit=5`,
  );
  const userId = (await found.json()).contractors[0].userId;

  const invited = await apiCall(gcToken, 'POST', `/projects/${projectId}/members`, {
    userId,
    projectRole: 'subcontractor',
    permissions,
  });
  const membershipId = (await invited.json()).member.id;
  await apiCall(guestToken, 'POST', `/project-invitations/${membershipId}/accept`);
  return invited.status;
};

const run = async () => {
  const browser = await chromium.launch();
  const contexts = [];
  const open = async () => {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    contexts.push(ctx);
    return ctx.newPage();
  };

  const gc = await open();
  const creator = await open();
  const plain = await open();

  const errors = [];
  for (const page of [gc, creator, plain]) {
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  }

  section('1. Three real accounts, and a project to hang work on');
  await register(gc, GC);
  await register(creator, CREATOR);
  await register(plain, PLAIN);

  await gc.goto(`${APP}/projects/new`, { waitUntil: 'networkidle' });
  await gc.fill('#name', `אתר פתיחת עבודה ${stamp}`);
  await gc.selectOption('#projectType', 'building');
  await gc.fill('#size', 'בניין 6 קומות');
  await gc.fill('#startDate', day(0));
  await gc.fill('#targetEndDate', day(90));
  await gc.fill('#overrunAllowanceDays', '10');
  await gc.click('button[type="submit"]');
  await gc.waitForTimeout(2000);
  check('A project exists', (await gc.locator('.project-card').count()) >= 1);

  const gcToken = await tokenFor(GC);
  const creatorToken = await tokenFor(CREATOR);
  const plainToken = await tokenFor(PLAIN);
  const mine = await (await apiCall(gcToken, 'GET', '/projects?limit=5')).json();
  const projectId = mine.projects[0].id;
  check('And its id is known', typeof projectId === 'string' && projectId.length === 24, projectId);

  await gc.goto(`${APP}/projects/${projectId}`, { waitUntil: 'networkidle' });
  await gc.waitForTimeout(1800);
  check('Its dashboard opens', (await gc.locator('#tasks-title').count()) === 1);

  section('2. The Project Dashboard offers the control, because the grant allows it');
  const dashCreate = gc.locator('a[href^="/tasks/new?projectId="]');
  check('The tasks panel carries a create control', (await dashCreate.count()) === 1);
  check('And it carries the project through', (await dashCreate.getAttribute('href')).includes(projectId));

  section('3. My Tasks now has somewhere to start from');
  await gc.goto(`${APP}/tasks`, { waitUntil: 'networkidle' });
  await gc.waitForTimeout(1400);
  check('The header carries a create control', (await gc.locator('header a[href="/tasks/new"]').count()) === 1);
  check('No task rows yet', (await gc.locator('.task-row').count()) === 0);
  check(
    'And the empty state now points somewhere — the flagged gap is closed',
    (await gc.locator('.panel a[href="/tasks/new"]').count()) >= 1,
  );

  section('4. A project task cannot be opened without a stage, and the screen says so');
  await gc.goto(`${APP}/tasks/new?projectId=${projectId}`, { waitUntil: 'networkidle' });
  await gc.waitForTimeout(1800);
  let body = await gc.textContent('main');
  check('The project arrives already chosen', (await gc.inputValue('#projectId')) === projectId);
  check('There are no stages yet, and it says so', body.includes('עדיין לא הוגדרו שלבים'));
  check('No stage control is offered while there are none', (await gc.locator('#stageId').count()) === 0);
  check('The window the work must sit inside is stated', body.includes(day(0)) && body.includes(day(100)));
  check(
    'and the end of it is the overrun ceiling, not the target',
    body.includes(day(100)) && !body.includes(`${day(90)} `),
  );

  section('5. The GC creates the stage the model requires');
  await gc.fill('#stageName', 'שלד');
  await gc.check('#stageIsGate');
  await gc.locator('button', { hasText: 'הוספת שלב' }).click();
  await gc.waitForTimeout(1800);
  check('A stage control now exists', (await gc.locator('#stageId').count()) === 1);
  check('And the new stage is already selected', (await gc.inputValue('#stageId')).length === 24);
  check('It is marked as a gate', (await gc.textContent('#stageId')).includes('שלב חוסם'));

  section('6. Opening real work, with the two commitment terms');
  await gc.selectOption('#assigneeId', { index: 1 }).catch(() => {});
  await gc.fill('#title', 'יציקת עמודים');
  await gc.fill('#description', 'קומה שנייה');
  await gc.fill('#startDate', day(5));
  await gc.fill('#dueDate', day(20));
  await gc.check('#ownCrewOnly');
  await gc.check('#delegatorOnSiteRequired');
  await gc.locator('form button[type="submit"]').click();
  await gc.waitForTimeout(2400);
  check('It lands on the new work’s own detail screen', /\/tasks\/[a-f0-9]{24}$/.test(gc.url()), gc.url());
  const detail = await gc.textContent('main');
  check('The title is what was typed', detail.includes('יציקת עמודים'));
  check('The stage it belongs to is named', detail.includes('שלד'));
  check('Own-crew-only travelled with the work', detail.includes('צוות עצמי'));

  await gc.goto(`${APP}/tasks`, { waitUntil: 'networkidle' });
  await gc.waitForTimeout(1600);
  check('And it appears in the queue', (await gc.locator('.task-row').count()) === 1);
  check(
    'as work that has not started — creating is not starting',
    (await gc.textContent('main')).includes('טרם התחילה'),
  );

  section('7. Client-side refusals mirror the server’s');
  await gc.goto(`${APP}/tasks/new?projectId=${projectId}`, { waitUntil: 'networkidle' });
  await gc.waitForTimeout(1800);
  await gc.selectOption('#stageId', { index: 1 });
  await gc.selectOption('#assigneeId', { index: 1 }).catch(() => {});
  await gc.fill('#title', 'מחוץ לטווח');
  await gc.fill('#startDate', day(5));
  await gc.fill('#dueDate', day(400));
  await gc.locator('form button[type="submit"]').click();
  await gc.waitForTimeout(1400);
  check('A due date past the ceiling is refused', gc.url().includes('/tasks/new'), gc.url());
  check(
    'and the reason names the project window',
    (await gc.textContent('main')).includes('חורג מטווח הפרויקט'),
  );

  await gc.fill('#startDate', day(30));
  await gc.fill('#dueDate', day(10));
  await gc.locator('form button[type="submit"]').click();
  await gc.waitForTimeout(1200);
  check(
    'A due date before the start date is refused too',
    (await gc.textContent('main')).includes('אינו יכול להקדים'),
  );

  section('8. task.create alone opens work, but names nobody else');
  check(
    'The grant holder joins the project',
    (await enrol(gcToken, creatorToken, projectId, CREATOR, ['task.create'])) === 201,
  );
  await creator.goto(`${APP}/tasks/new`, { waitUntil: 'networkidle' });
  await creator.waitForTimeout(1800);
  await creator.selectOption('#projectId', projectId);
  await creator.waitForTimeout(1800);
  body = await creator.textContent('main');
  check('The project is offered to the grant holder', (await creator.inputValue('#projectId')) === projectId);
  check(
    'No assignee control is offered — absent, not disabled',
    (await creator.locator('#assigneeId').count()) === 0,
  );
  check('And the screen says why, in singular', body.includes('על שמי בלבד'));
  check(
    'Stage creation is refused to somebody who cannot edit the project',
    (await creator.locator('#stageName').count()) === 0 && body.includes('מורשה לערוך'),
  );

  await creator.selectOption('#stageId', { index: 1 });
  await creator.fill('#title', 'עבודה על שמי');
  await creator.fill('#startDate', day(6));
  await creator.fill('#dueDate', day(12));
  await creator.locator('form button[type="submit"]').click();
  await creator.waitForTimeout(2400);
  check('The work is opened in their own name', /\/tasks\/[a-f0-9]{24}$/.test(creator.url()), creator.url());

  section('9. A member with no grant is offered no project at all');
  check(
    'A member with no permissions joins the same project',
    (await enrol(gcToken, plainToken, projectId, PLAIN, [])) === 201,
  );
  await plain.goto(`${APP}/tasks/new`, { waitUntil: 'networkidle' });
  await plain.waitForTimeout(1800);
  body = await plain.textContent('main');
  // Only the disabled placeholder may remain, and only if the picker renders at all.
  const projectOptions = await plain.locator('#projectId option').count().catch(() => 0);
  check('No project is listed for them', projectOptions <= 1, `${projectOptions}`);
  check(
    'And the Project Dashboard offers them no create control',
    await (async () => {
      await plain.goto(`${APP}/projects/${projectId}`, { waitUntil: 'networkidle' });
      await plain.waitForTimeout(1600);
      return (await plain.locator('a[href^="/tasks/new?projectId="]').count()) === 0;
    })(),
  );

  section('10. Standalone work is self-assigned and names no project');
  await plain.goto(`${APP}/tasks/new`, { waitUntil: 'networkidle' });
  await plain.waitForTimeout(1600);
  const standalone = plain.locator('#kind-standalone');
  // With no project open to them, standalone is the only kind — so there is nothing to choose.
  check('No kind chooser is offered when only one kind is possible', (await standalone.count()) === 0);
  check(
    'Standalone work says it is opened in your own name',
    (await plain.textContent('main')).includes('נפתחת תמיד על שמי'),
  );
  check('No project control is shown for it', (await plain.locator('#projectId').count()) === 0);
  check('No stage control either', (await plain.locator('#stageId').count()) === 0);
  check('And no commitment terms, which belong to project work', (await plain.locator('#ownCrewOnly').count()) === 0);

  await plain.fill('#title', 'תיקון אצל לקוח');
  await plain.fill('#startDate', day(3));
  await plain.fill('#dueDate', day(9));
  await plain.locator('form button[type="submit"]').click();
  await plain.waitForTimeout(2400);
  check('Standalone work is opened', /\/tasks\/[a-f0-9]{24}$/.test(plain.url()), plain.url());
  await plain.goto(`${APP}/tasks`, { waitUntil: 'networkidle' });
  await plain.waitForTimeout(1600);
  // Scoped to the row: the filter dropdowns list these same labels, so page text proves nothing.
  const soloRow = plain.locator('.task-row');
  check('One row is listed', (await soloRow.count()) === 1, `${await soloRow.count()}`);
  const soloText = await soloRow.first().textContent();
  check('It is marked as standalone work', soloText.includes('עבודה עצמאית'));
  check('with no project named', soloText.includes('ללא פרויקט'));
  check('and the viewer as the one who opened it', soloText.includes('עבודה שפתחתי'));

  section('11. Hebrew stays singular and gender-neutral');
  await gc.goto(`${APP}/tasks/new?projectId=${projectId}`, { waitUntil: 'networkidle' });
  await gc.waitForTimeout(1800);
  const he = await gc.textContent('main');
  for (const banned of FORBIDDEN_HE) {
    check(`No plural-as-neutral: ${banned}`, !he.includes(banned));
  }

  section('12. Both languages, three widths');
  for (const [lang, label] of [['he', 'Hebrew'], ['en', 'English']]) {
    await gc.evaluate((l) => window.localStorage.setItem('fieldsync.lang', l), lang);
    for (const [w, h, name] of [[1440, 900, '1440'], [834, 1112, '834'], [390, 844, '390']]) {
      await gc.setViewportSize({ width: w, height: h });
      await gc.goto(`${APP}/tasks/new?projectId=${projectId}`, { waitUntil: 'networkidle' });
      await gc.waitForTimeout(1400);
      check(`${label} ${name}px — no horizontal overflow`, (await overflow(gc)) <= 0, `${await overflow(gc)}px`);
      check(`${label} ${name}px — the form renders`, (await gc.locator('form.panel').count()) === 1);
    }
  }
  await gc.setViewportSize({ width: 1440, height: 900 });

  section('13. Page errors');
  const unexpected = errors.filter((e) => !/status of 40[034]/.test(e));
  check('No uncaught page error', unexpected.length === 0, unexpected.slice(0, 2).join(' | '));

  for (const ctx of contexts) await ctx.close();
  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
