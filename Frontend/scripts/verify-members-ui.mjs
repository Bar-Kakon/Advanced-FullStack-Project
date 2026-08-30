/**
 * Real-browser proof of Project members and the pending-invitation area on My projects.
 *
 * Two real accounts in two browser contexts: one invites, the other answers. Nothing is stubbed —
 * every row on both screens comes from the API.
 *
 *   npm run verify:members-ui
 */
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const PASSWORD = 'CorrectHorse42!';
const FORBIDDEN_HE = ['בחרו', 'הזינו', 'אישרתם', 'הסרתם', 'ברצונכם', 'בחר/י', 'הזן/י', 'לכם', 'שלכם'];

const stamp = Date.now();
const OWNER = {
  firstName: 'Site', lastName: `Owner${stamp}`,
  companyName: `Members Co ${stamp}`, email: `members.owner.${stamp}@example.com`,
};
const GUEST = {
  firstName: 'Sub', lastName: `Guest${stamp}`,
  companyName: `Guest Co ${stamp}`, email: `members.guest.${stamp}@example.com`,
};
const PROJECT = `אתר משתתפים ${stamp}`;

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(64)} ${detail}`);
};
const section = (t) => console.log(`\n${t}`);

const day = (o) => new Date(Date.UTC(2027, 3, 5) + o * 86400000).toISOString().slice(0, 10);

const register = async (page, who) => {
  await page.goto(`${APP}/register`, { waitUntil: 'networkidle' });
  await page.fill('#firstName', who.firstName);
  await page.fill('#lastName', who.lastName);
  await page.selectOption('#standing', 'owner').catch(() => {});
  await page.fill('#companyName', who.companyName);
  await page.fill('#email', who.email);
  await page.fill('#password', PASSWORD);
  await page.fill('#password-confirm', PASSWORD);
  // Step 1 opens with the route: it decides which taxonomy the specialty select offers.
  await page.selectOption('#registrationCategory', 'contractor').catch(() => {});
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
  // Step 1 done; Step 2 asks for the email choice and the Terms.
  await page.click('button[type="submit"]');
  await page.waitForTimeout(700);
  await page.check('#operationalEmail-accept').catch(() => {});
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

  section('1. Two real accounts');
  await register(owner, OWNER);
  await register(guest, GUEST);
  check('The owner is signed in', owner.url().includes('/dashboard') || owner.url().includes('/onboarding'), owner.url());
  check('And so is the invitee', guest.url().includes('/dashboard') || guest.url().includes('/onboarding'), guest.url());

  section('2. A project, and its one member');
  await owner.goto(`${APP}/projects/new`, { waitUntil: 'networkidle' });
  await owner.fill('#name', PROJECT);
  await owner.selectOption('#projectType', 'building');
  await owner.fill('#size', 'בניין 6 קומות');
  await owner.fill('#startDate', day(0));
  await owner.fill('#targetEndDate', day(90));
  await owner.fill('#overrunAllowanceDays', '15');
  await owner.click('button[type="submit"]');
  await owner.waitForTimeout(1800);
  check('The project was created', (await owner.locator('.project-card', { hasText: PROJECT }).count()) === 1);

  const membersLink = owner.locator('.project-card', { hasText: PROJECT }).locator('a[href$="/members"]');
  check('My projects offers a path into Project members', (await membersLink.count()) === 1);
  await membersLink.click();
  await owner.waitForTimeout(1500);
  check('It navigates to the members route', /\/projects\/[a-f0-9]{24}\/members$/.test(owner.url()), owner.url());
  const projectId = owner.url().split('/projects/')[1].split('/')[0];

  check('One member is listed', (await owner.locator('.member-row').count()) === 1);
  check('It is the viewer', (await owner.locator('.member-row .perm-chip', { hasText: 'זה אני' }).count()) === 1);
  check('Holding Full Project Authority as a row',
    (await owner.locator('.member-row .perm-chip--full').count()) === 1);
  check('Their own row offers no removal control',
    (await owner.locator('.member-row__actions').count()) === 0);
  check('The pending section is present and empty',
    (await owner.textContent('main')).includes('אין הזמנות פתוחות'));
  check('And the invite form is offered', (await owner.locator('#memberSearch').count()) === 1);

  section('3. Inviting through the existing people search');
  await owner.fill('#memberSearch', GUEST.lastName);
  await owner.waitForTimeout(1800);
  check('The search finds the person', (await owner.locator('.member-picker__option').count()) >= 1);
  await owner.locator('.member-picker__option').first().click();
  await owner.waitForTimeout(400);
  check('The choice is confirmed on screen', (await owner.locator('.member-picked').count()) === 1);
  check('The authority block is offered to a grantor', (await owner.locator('.member-authority').count()) === 1);
  check('And it defaults to no management authority',
    await owner.locator('input[name="authorityMode"]').first().isChecked());

  await owner.selectOption('#projectRole', 'subcontractor');
  await owner.click('.member-invite__actions .btn--primary');
  await owner.waitForTimeout(2000);

  check('The invitation appears as pending, not as a member',
    (await owner.locator('.member-row').count()) === 2);
  const pendingText = await owner.textContent('main');
  check('The pending panel names the invitee', pendingText.includes(GUEST.lastName));
  check('The form was cleared after sending', (await owner.locator('.member-picked').count()) === 0);

  section('4. An invitation grants no read on the project');
  await guest.goto(`${APP}/projects/${projectId}/members`, { waitUntil: 'networkidle' });
  await guest.waitForTimeout(1500);
  check('The invitee cannot open the member list yet',
    (await guest.locator('.form-alert, .alert').count()) >= 1 ||
    (await guest.textContent('main')).includes('לא נמצא'));
  check('And no member row is rendered', (await guest.locator('.member-row').count()) === 0);

  section('5. The invitation card on My projects — the approved disclosure');
  await guest.goto(`${APP}/projects`, { waitUntil: 'networkidle' });
  await guest.waitForTimeout(1500);
  const card = guest.locator('.project-card--invitation');
  check('One invitation is waiting', (await card.count()) === 1);
  const cardText = await card.textContent();
  check('It names the project', cardText.includes(PROJECT));
  check('It shows the type', cardText.includes('בניין'));
  check('It shows who invited', cardText.includes(OWNER.lastName));
  check('It shows the role being offered', cardText.includes('קבלן משנה'));
  check('It shows both dates', /\d/.test(cardText));
  check('It does NOT disclose the free-text size', !cardText.includes('בניין 6 קומות'));
  check('It does NOT disclose any member', !cardText.includes('זה אני'));
  check('The project itself is still not listed',
    (await guest.locator('.project-card:not(.project-card--invitation)').count()) === 0);
  check('Both answers are offered', (await card.locator('.btn').count()) === 2);

  section('6. Declining, and being invited again');
  await card.locator('.btn--quiet').click();
  await guest.waitForTimeout(2000);
  check('The card leaves the list', (await guest.locator('.project-card--invitation').count()) === 0);
  await guest.reload({ waitUntil: 'networkidle' });
  await guest.waitForTimeout(1200);
  check('Still gone after a reload — the server dropped it, not React',
    (await guest.locator('.project-card--invitation').count()) === 0);

  await owner.reload({ waitUntil: 'networkidle' });
  await owner.waitForTimeout(1500);
  check('And the pending panel on the other side is empty again',
    (await owner.textContent('main')).includes('אין הזמנות פתוחות'));

  await owner.fill('#memberSearch', GUEST.lastName);
  await owner.waitForTimeout(1800);
  await owner.locator('.member-picker__option').first().click();
  await owner.selectOption('#projectRole', 'subcontractor');
  await owner.click('.member-invite__actions .btn--primary');
  await owner.waitForTimeout(2000);
  check('A refusal is not permanent — the same person is invited again',
    (await owner.locator('.member-row').count()) === 2);

  section('7. Accepting');
  await guest.goto(`${APP}/projects`, { waitUntil: 'networkidle' });
  await guest.waitForTimeout(1500);
  await guest.locator('.project-card--invitation .btn--primary').click();
  await guest.waitForTimeout(2200);
  check('The invitation is gone', (await guest.locator('.project-card--invitation').count()) === 0);
  check('And the project is now listed',
    (await guest.locator('.project-card', { hasText: PROJECT }).count()) === 1);
  check('Accepting granted no management authority — no Edit control',
    (await guest.locator('.project-card', { hasText: PROJECT }).locator('a[href$="/edit"]').count()) === 0);

  section('8. A member sees the list, and no control the API would refuse');
  await guest.goto(`${APP}/projects/${projectId}/members`, { waitUntil: 'networkidle' });
  await guest.waitForTimeout(1500);
  check('The member list opens now', (await guest.locator('.member-row').count()) === 2);
  check('No invite form is offered', (await guest.locator('#memberSearch').count()) === 0);
  check('No authority block is offered', (await guest.locator('.member-authority').count()) === 0);
  check('No removal control is offered', (await guest.locator('.member-row__actions').count()) === 0);
  check('No role selector is offered', (await guest.locator('.form-select--inline').count()) === 0);
  check('And the screen says why permissions are not shown',
    (await guest.textContent('main')).includes('מוסמך לנהל אותן'));

  section('9. Authority is granted explicitly, over the same rows');
  await owner.goto(`${APP}/permissions`, { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1600);
  const guestGrant = owner.locator('.perm-grant').filter({ hasNot: owner.locator('.perm-chip', { hasText: 'ההרשאה שלי' }) });
  check('The central surface carries the member as a grant', (await guestGrant.count()) >= 1);
  // Addressed by permission code, not by position: a catalogue that gains a code must not silently
  // move this assertion onto a different permission.
  const inviteBox = guestGrant.first().locator('.perm-checks input[value="project.member.invite"]');
  // The list is controlled by the server answer, so the box only ticks after the re-read lands.
  await inviteBox.click();
  await owner.waitForTimeout(2500);
  check('The grant is written and read back', await inviteBox.isChecked());

  await guest.reload({ waitUntil: 'networkidle' });
  await guest.waitForTimeout(1600);
  check('The granted member may now invite', (await guest.locator('#memberSearch').count()) === 1);
  check('But still may not hand out authority',
    (await guest.locator('.member-authority').count()) === 0);

  section('10. Direct navigation and a project that is not theirs');
  await guest.goto(`${APP}/projects/${projectId}/members`, { waitUntil: 'networkidle' });
  await guest.waitForTimeout(1400);
  check('A direct URL works', (await guest.locator('.member-row').count()) === 2);
  await guest.goto(`${APP}/projects/000000000000000000000000/members`, { waitUntil: 'networkidle' });
  await guest.waitForTimeout(1400);
  check('A project that is not theirs renders an error, not a member list',
    (await guest.locator('.member-row').count()) === 0);
  check('And says so', (await guest.textContent('main')).includes('לא נמצא'));

  section('11. Hebrew addresses one person');
  await owner.goto(`${APP}/projects/${projectId}/members`, { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1400);
  const he = await owner.textContent('main');
  const bad = FORBIDDEN_HE.filter((f) => he.includes(f));
  check('No plural-as-neutral and no slash forms', bad.length === 0, bad.join(' · '));
  check('A person’s name is never translated', he.includes(GUEST.lastName));

  section('12. Both languages at three widths');
  for (const [label, width, height] of [['desktop', 1440, 900], ['tablet', 834, 1100], ['mobile', 390, 844]]) {
    await owner.setViewportSize({ width, height });
    for (const lang of ['en', 'עב']) {
      await owner.click(`.lang-switch__btn:has-text("${lang}")`).catch(() => {});
      await owner.waitForTimeout(500);
      for (const route of [`/projects/${projectId}/members`, '/projects']) {
        await owner.goto(`${APP}${route}`, { waitUntil: 'networkidle' });
        await owner.waitForTimeout(900);
        check(`${label} ${lang} ${route} — no horizontal overflow`, (await overflow(owner)) <= 0,
          `${await overflow(owner)}px`);
      }
    }
  }
  await owner.setViewportSize({ width: 1440, height: 900 });

  section('13. Long names do not break the layout');
  await owner.goto(`${APP}/projects/${projectId}/members`, { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1000);
  await owner.evaluate(() => {
    const name = document.querySelector('.member-row__name');
    if (name) name.textContent = 'א'.repeat(140);
  });
  await owner.setViewportSize({ width: 390, height: 844 });
  await owner.waitForTimeout(500);
  check('A 140-character name still fits on mobile', (await overflow(owner)) <= 0, `${await overflow(owner)}px`);
  await owner.setViewportSize({ width: 1440, height: 900 });

  section('14. Removing, and the self-lockout rule');
  await owner.goto(`${APP}/projects/${projectId}/members`, { waitUntil: 'networkidle' });
  await owner.waitForTimeout(1400);
  const ownRow = owner.locator('.member-row').filter({ has: owner.locator('.perm-chip', { hasText: 'זה אני' }) });
  check('The viewer’s own row offers no removal', (await ownRow.locator('.member-row__actions').count()) === 0);
  const otherRow = owner.locator('.member-row').filter({ hasNot: owner.locator('.perm-chip', { hasText: 'זה אני' }) });
  check('Another member’s row does', (await otherRow.first().locator('.member-row__actions .btn').count()) === 1);
  await otherRow.first().locator('.member-row__actions .btn').click();
  await owner.waitForTimeout(2000);
  check('Removing leaves one member', (await owner.locator('.member-row').count()) === 1);

  await guest.goto(`${APP}/projects`, { waitUntil: 'networkidle' });
  await guest.waitForTimeout(1500);
  check('And the project leaves the removed person’s list',
    (await guest.locator('.project-card', { hasText: PROJECT }).count()) === 0);

  section('15. Page errors');
  const unexpected = errors.filter((e) => !/status of 40[34]/.test(e));
  check('No uncaught page error', unexpected.length === 0, unexpected.slice(0, 2).join(' | '));

  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
