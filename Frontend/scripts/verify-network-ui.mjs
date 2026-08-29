/**
 * Real-browser proof of My Network against the real API.
 *
 * Two real accounts drive the whole relationship lifecycle through the screen's own controls:
 * request, accept, remove, decline, withdraw, block and unblock — then the screen is measured in
 * both languages at three widths.
 *
 *   npm run verify:network-ui
 */
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'CorrectHorse42!';

const FORBIDDEN_HE = ['בחרו', 'הזינו', 'אישרתם', 'הסרתם', 'ברצונכם', 'בחר/י', 'הזן/י', 'לכם', 'שלכם', 'הצעתם'];

const stamp = Date.now();
const ACCOUNTS = [
  { firstName: 'Neta', lastName: `First${stamp}`, companyName: `Net One ${stamp}`, email: `net1.${stamp}@example.com` },
  { firstName: 'Omer', lastName: `Second${stamp}`, companyName: `Net Two ${stamp}`, email: `net2.${stamp}@example.com` },
];

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(64)} ${detail}`);
};
const section = (title) => console.log(`\n${title}`);

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
  await cityBox.fill('חיפה');
  await page.waitForTimeout(2200);
  const options = page.locator('.place-field__list [role="option"]');
  if ((await options.count()) > 0) await options.first().click();
  await page.selectOption('#region', 'haifa').catch(() => {});
  const boxes = page.locator('input[type="checkbox"]');
  for (let i = 0; i < (await boxes.count()); i += 1) await boxes.nth(i).check().catch(() => {});
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
};

const login = async (page, who) => {
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', who.email);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
};

const token = (page) => page.evaluate(() => window.localStorage.getItem('fieldsync-access-token'));

const call = (page, method, path, bearer) =>
  page.evaluate(
    async ([api, m, p, t]) => {
      const r = await fetch(`${api}${p}`, { method: m, headers: { Authorization: `Bearer ${t}` } });
      return { status: r.status, body: await r.text() };
    },
    [API, method, path, bearer],
  );

const openTab = async (page, name) => {
  await page.goto(`${APP}/network`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  await page.click(`[role="tab"]:nth-of-type(${name})`).catch(() => {});
  await page.waitForTimeout(700);
};

const tabByIndex = async (page, index) => {
  const tabs = page.locator('[role="tab"]');
  await tabs.nth(index).click();
  await page.waitForTimeout(800);
};

const rowNames = (page) => page.$$eval('.net-row__name', (n) => n.map((x) => x.textContent.trim()));

const run = async () => {
  const browser = await chromium.launch();
  const contextA = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const contextB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const A = await contextA.newPage();
  const B = await contextB.newPage();

  const pageErrors = [];
  for (const p of [A, B]) {
    p.on('pageerror', (e) => pageErrors.push(String(e)));
    p.on('console', (m) => { if (m.type() === 'error') pageErrors.push(m.text()); });
  }

  section('1. Two real accounts');
  await register(A, ACCOUNTS[0]);
  await register(B, ACCOUNTS[1]);
  await login(A, ACCOUNTS[0]);
  await login(B, ACCOUNTS[1]);
  const tokenA = await token(A);
  const tokenB = await token(B);
  check('Both accounts signed in', Boolean(tokenA) && Boolean(tokenB));

  const meA = JSON.parse(atob(tokenA.split('.')[1])).sub;
  const meB = JSON.parse(atob(tokenB.split('.')[1])).sub;

  section('2. The screen is reachable from the navbar');
  await A.goto(`${APP}/dashboard`, { waitUntil: 'networkidle' });
  const navLink = A.locator('.app-nav__link[href="/network"]');
  check('The navbar link to My network is real, not "#"', (await navLink.count()) === 1);
  await navLink.click();
  await A.waitForTimeout(900);
  check('It navigates to /network', A.url().includes('/network'), A.url());

  section('3. Empty groups say so rather than showing nothing');
  check('Four tabs are rendered', (await A.locator('[role="tab"]').count()) === 4);
  check('Connected is empty and says so', (await A.locator('.panel__lede').count()) > 0);
  check('No rows are listed', (await A.locator('.net-row').count()) === 0);

  section('4. Outgoing and incoming, through the real API');
  const requested = await call(A, 'POST', `/connections/${meB}/request`, tokenA);
  check('A connection request was created', requested.status === 201, requested.status);

  await A.goto(`${APP}/network`, { waitUntil: 'networkidle' });
  await tabByIndex(A, 2);
  let names = await rowNames(A);
  check('A sees it under Requests sent', names.some((n) => n.includes(ACCOUNTS[1].lastName)), names.join(' · '));
  check(
    'Withdraw is offered and View profile is too',
    (await A.locator('.net-row__actions .btn').count()) === 2,
  );

  await B.goto(`${APP}/network`, { waitUntil: 'networkidle' });
  await tabByIndex(B, 1);
  names = await rowNames(B);
  check('B sees it under Requests received', names.some((n) => n.includes(ACCOUNTS[0].lastName)), names.join(' · '));
  check(
    'Accept, Decline and View profile are the three controls',
    (await B.locator('.net-row__actions .btn').count()) === 3,
  );

  section('5. View profile reuses the Browse public profile');
  await B.click('.net-row__actions .btn:has-text("צפייה בפרופיל"), .net-row__actions .btn:has-text("View profile")');
  await B.waitForTimeout(1200);
  check('The shared public profile panel opens', (await B.locator('.profile-panel').count()) === 1);
  const panelText = await B.textContent('.profile-panel');
  check('It shows the other person’s real name', panelText.includes(ACCOUNTS[0].lastName));

  // D15 asserted on the payload itself: a regex over rendered text cannot tell a phone number
  // from any other run of digits, and these accounts carry digits in their generated names.
  const served = await B.evaluate(
    async ([api, id, t]) => {
      const r = await fetch(`${api}/browse/contractors/${id}`, { headers: { Authorization: `Bearer ${t}` } });
      return r.json();
    },
    [API, meA, tokenB],
  );
  const phones = served?.profile?.phones;
  check('D15 — the office phone is withheld from a non-entitled viewer', phones?.officePhone === null, JSON.stringify(phones));
  check('D15 — the business phone is withheld too, with no fallback', phones?.businessPhone === null);
  check('D15 — and the payload says why rather than showing a blank', phones?.visibility === 'hidden_no_approved_case', phones?.visibility);
  check('The personal/login phone is not in the shape at all', !('phone' in (served?.profile ?? {})));
  await B.click('.profile-panel .adv-panel__close').catch(() => {});
  await B.waitForTimeout(400);

  section('6. Accept, through the screen');
  await B.click('.net-row__actions .btn:has-text("אישור"), .net-row__actions .btn:has-text("Accept")');
  await B.waitForTimeout(1500);
  check('The incoming row is gone after accepting', (await B.locator('.net-row').count()) === 0);

  await tabByIndex(B, 0);
  names = await rowNames(B);
  check('B now has the connection', names.some((n) => n.includes(ACCOUNTS[0].lastName)), names.join(' · '));
  check(
    'Connected offers View profile and Remove, and no Message',
    (await B.locator('.net-row__actions .btn').count()) === 2,
  );
  const connectedText = await B.textContent('.net-row__actions');
  check('No Message control exists — messaging is not built', !/הודע|Message/i.test(connectedText));

  await A.goto(`${APP}/network`, { waitUntil: 'networkidle' });
  await tabByIndex(A, 0);
  names = await rowNames(A);
  check('A sees the same connection', names.some((n) => n.includes(ACCOUNTS[1].lastName)), names.join(' · '));

  section('7. Persistence across a reload');
  await A.reload({ waitUntil: 'networkidle' });
  await A.waitForTimeout(900);
  await tabByIndex(A, 0);
  check('The connection is still there after a reload', (await A.locator('.net-row').count()) === 1);

  section('8. Remove, through the screen');
  await A.click('.net-row__actions .btn:has-text("הסרת הקשר"), .net-row__actions .btn:has-text("Remove connection")');
  await A.waitForTimeout(1500);
  check('The connection is gone for A', (await A.locator('.net-row').count()) === 0);

  await B.goto(`${APP}/network`, { waitUntil: 'networkidle' });
  await tabByIndex(B, 0);
  check('And gone for B', (await B.locator('.net-row').count()) === 0);

  section('9. D17 — decline is historical, and the pair may ask again');
  await call(A, 'POST', `/connections/${meB}/request`, tokenA);
  await B.goto(`${APP}/network`, { waitUntil: 'networkidle' });
  await tabByIndex(B, 1);
  await B.click('.net-row__actions .btn:has-text("דחייה"), .net-row__actions .btn:has-text("Decline")');
  await B.waitForTimeout(1500);
  check('The declined request leaves the incoming list', (await B.locator('.net-row').count()) === 0);

  const again = await call(A, 'POST', `/connections/${meB}/request`, tokenA);
  check('The same pair may request again after a decline', again.status === 201, again.status);

  section('10. Withdraw, through the screen');
  await A.goto(`${APP}/network`, { waitUntil: 'networkidle' });
  await tabByIndex(A, 2);
  check('The new request is outgoing', (await A.locator('.net-row').count()) === 1);
  await A.click('.net-row__actions .btn:has-text("ביטול הבקשה"), .net-row__actions .btn:has-text("Withdraw")');
  await A.waitForTimeout(1500);
  check('Withdrawing clears it', (await A.locator('.net-row').count()) === 0);

  section('11. D19 — blocks created by me, and Unblock');
  const blocked = await call(A, 'PUT', `/blocks/${meB}`, tokenA);
  check('A block was created', blocked.status === 201, blocked.status);

  await A.goto(`${APP}/network`, { waitUntil: 'networkidle' });
  await tabByIndex(A, 3);
  names = await rowNames(A);
  check('A sees the block she created', names.some((n) => n.includes(ACCOUNTS[1].lastName)), names.join(' · '));
  check(
    'Unblock is the only control — a blocked profile would 404, so no View profile is offered',
    (await A.locator('.net-row__actions .btn').count()) === 1,
  );

  await B.goto(`${APP}/network`, { waitUntil: 'networkidle' });
  await tabByIndex(B, 3);
  check('The blocked person is never told — their own list is empty', (await B.locator('.net-row').count()) === 0);
  const bText = await B.textContent('main');
  check('And nothing says anybody blocked them', !/חסמ|blocked you/i.test(bText.replace(/חסימות שיצרתי/g, '')));

  await A.click('.net-row__actions .btn:has-text("ביטול החסימה"), .net-row__actions .btn:has-text("Unblock")');
  await A.waitForTimeout(1500);
  check('Unblocking clears the row', (await A.locator('.net-row').count()) === 0);

  await A.reload({ waitUntil: 'networkidle' });
  await A.waitForTimeout(900);
  await tabByIndex(A, 3);
  check('And it stays cleared after a reload', (await A.locator('.net-row').count()) === 0);

  section('12. Both languages, three widths, no overflow');
  await call(A, 'POST', `/connections/${meB}/request`, tokenA);
  await A.goto(`${APP}/network`, { waitUntil: 'networkidle' });
  await tabByIndex(A, 2);

  for (const lang of ['he', 'en']) {
    await A.click(`.lang-switch__btn:has-text("${lang === 'he' ? 'עב' : 'EN'}")`);
    await A.waitForTimeout(300);
    for (const [label, width, height] of [['desktop', 1440, 900], ['tablet', 834, 1112], ['mobile', 390, 844]]) {
      await A.setViewportSize({ width, height });
      await A.waitForTimeout(250);
      const m = await A.evaluate(() => ({
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        direction: document.documentElement.dir || document.body.dir,
      }));
      check(`${lang} · ${label} ${width}px — 0px horizontal overflow`, m.overflow <= 0, `overflow=${m.overflow}px`);
      check(`${lang} · ${label} — direction is ${lang === 'he' ? 'rtl' : 'ltr'}`, m.direction === (lang === 'he' ? 'rtl' : 'ltr'), m.direction);
    }
    await A.setViewportSize({ width: 1440, height: 900 });
  }

  section('13. Copy rules and dead controls');
  await A.click('.lang-switch__btn:has-text("עב")');
  await A.waitForTimeout(300);
  const heText = await A.textContent('main');
  const badHebrew = FORBIDDEN_HE.filter((f) => heText.includes(f));
  check('Hebrew addresses one person', badHebrew.length === 0, badHebrew.join(' · '));

  await A.click('.lang-switch__btn:has-text("EN")');
  await A.waitForTimeout(300);
  const enWhole = await A.textContent('body');
  check('The other person’s name is not translated', enWhole.includes(ACCOUNTS[1].lastName));

  const deadLinks = await A.$$eval('main a', (nodes) =>
    nodes.filter((n) => { const h = n.getAttribute('href'); return h === null || h === '#' || h === ''; })
         .map((n) => n.textContent.trim()));
  check('No dead link in the screen body', deadLinks.length === 0, deadLinks.join(' · '));

  const pretend = ['coming soon', 'not implemented', 'prototype', 'בקרוב'];
  check('No "coming soon" copy', !pretend.some((p) => enWhole.toLowerCase().includes(p.toLowerCase())));

  section('14. Page errors');
  check('No uncaught page error', pageErrors.length === 0, pageErrors.slice(0, 2).join(' | '));

  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((e) => { console.error(e); process.exit(1); });
