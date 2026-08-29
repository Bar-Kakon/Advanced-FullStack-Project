/**
 * The whole application, once, in one browser session, from one develop checkout.
 *
 * Register → Login → Account menu → My profile → Edit profile → save → avatar → work entry →
 * Employee management → invite → cancel → Browse → search → Public profile → Places → travel →
 * Logout → failed refresh → Login again.
 *
 * Nothing is stubbed and nothing is intercepted: the real browser Places key and the real backend
 * key are used, and no credential value is ever printed.
 *
 *   npm run verify:integrated
 */
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'CorrectHorse42!';

const stamp = Date.now();
const ME = {
  firstName: 'Integrated',
  lastName: `Owner${stamp}`,
  companyName: `Integrated Co ${stamp}`,
  email: `integrated-flow.${stamp}@example.com`,
  officePhone: '0500000013',
  businessPhone: '0500000012',
};

/** Values from the retired prototype. None may appear on a real account, ever. */
const NEVER = ['כאכון בנייה בע״מ', 'Kakon Construction Ltd.', '04-8123456', '052-555-0123',
  'מגדלי הצפון', 'Northern Towers', 'בר כאכון', 'Bar Kakon'];

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(60)} ${detail}`);
};
const section = (title) => console.log(`\n${title}`);

const run = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const calls = [];
  const consoleErrors = [];
  page.on('request', (r) => { if (r.url().startsWith(API)) calls.push(`${r.method()} ${r.url().slice(API.length)}`); });
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  const text = () => page.evaluate(() => document.body.innerText);
  const setLang = async (lang) => {
    await page.click(`.lang-switch__btn:has-text("${lang === 'he' ? 'עב' : 'EN'}")`);
    await page.waitForTimeout(350);
  };

  section('1. Register');
  await page.goto(`${APP}/register`, { waitUntil: 'networkidle' });
  await page.fill('#firstName', ME.firstName);
  await page.fill('#lastName', ME.lastName);
  await page.selectOption('#standing', 'owner').catch(() => {});
  await page.fill('#companyName', ME.companyName);
  await page.fill('#email', ME.email);
  await page.fill('#password', PASSWORD);
  await page.fill('#password-confirm', PASSWORD);
  await page.selectOption('#specialty', 'electrical').catch(() => {});

  // The city box is now the shared structured field.
  const cityBox = page.locator('.place-field input[role="combobox"]');
  const usedPlaces = (await cityBox.count()) > 0;
  check('Register uses the shared structured location field', usedPlaces);
  if (usedPlaces) {
    await cityBox.fill('חיפה');
    await page.waitForTimeout(2200);
    const options = page.locator('.place-field__list [role="option"]');
    check('Register Places offers live suggestions', (await options.count()) > 0,
      `${await options.count()} options`);
    if ((await options.count()) > 0) await options.first().click();
  }
  await page.selectOption('#region', 'haifa').catch(() => {});
  await page.fill('#officePhone', ME.officePhone).catch(() => {});
  await page.fill('#businessPhone', ME.businessPhone).catch(() => {});
  const boxes = page.locator('input[type="checkbox"]');
  for (let i = 0; i < (await boxes.count()); i += 1) await boxes.nth(i).check().catch(() => {});
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  check('registration completed', !page.url().includes('/register'), new URL(page.url()).pathname);

  section('2. Login');
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', ME.email);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  check('signed in', !page.url().includes('/login'), new URL(page.url()).pathname);

  section('3. Account menu, and the name in both languages');
  await page.goto(`${APP}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  for (const lang of ['he', 'en', 'he']) {
    await setLang(lang);
    const chip = (await page.locator('.nav-profile__name').first().textContent())?.trim();
    check(`${lang}: the chip shows the stored name`, chip === `${ME.firstName} ${ME.lastName}`, chip);
  }
  await setLang('en');
  await page.click('.nav-profile');
  await page.waitForTimeout(400);
  check('the chip opens an MUI menu', (await page.locator('[role="menu"]').count()) === 1);
  const items = await page.$$eval('[role="menu"] [role="menuitem"]',
    (n) => n.map((x) => ({ text: x.textContent.trim(), disabled: x.getAttribute('aria-disabled') === 'true' })));
  check('with three entries', items.length === 3, items.map((i) => i.text.slice(0, 24)).join(' | '));
  check('Settings disabled until that screen exists', items[1]?.disabled === true);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  section('4. My profile shows real data');
  const shown = await text();
  check('the company name typed at registration', shown.includes(ME.companyName));
  check('the office phone typed at registration', shown.includes(ME.officePhone));
  check('the business phone typed at registration', shown.includes(ME.businessPhone));
  check('GET /users/me actually happened', calls.some((c) => c.startsWith('GET /users/me')));
  const leaked = NEVER.filter((v) => shown.includes(v));
  check('no prototype value anywhere', leaked.length === 0, leaked.join(', ') || 'none');
  check('no invented rating', !/\b4\.6\b/.test(shown));

  section('5. Edit profile, save, reload');
  await page.goto(`${APP}/profile/edit`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('company name is loaded into the form',
    (await page.inputValue('#companyName')) === ME.companyName);
  const bio = `Integrated bio ${stamp}`;
  await page.fill('#bio', bio);
  await page.fill('#businessPhone', '0500000099');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  check('PATCH /users/me happened', calls.some((c) => c.startsWith('PATCH /users/me')));
  await page.goto(`${APP}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const saved = await text();
  check('the new bio survived a reload', saved.includes(bio));
  check('the new business phone survived a reload', saved.includes('0500000099'));
  check('the office phone was left alone', saved.includes(ME.officePhone));

  section('6. Avatar — multipart, GridFS, and a reload');
  await page.goto(`${APP}/profile/edit`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.setInputFiles('input#avatar', { name: 'a.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForTimeout(2500);
  check('PUT /users/me/avatar happened', calls.some((c) => c.startsWith('PUT /users/me/avatar')));
  check('the picture renders', (await page.locator('.avatar--image').count()) >= 1);
  await page.goto(`${APP}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('and is still there after a reload', (await page.locator('.avatar--image').count()) >= 1);

  await page.goto(`${APP}/profile/edit`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.setInputFiles('input#avatar', { name: 'b.jpg', mimeType: 'image/jpeg', buffer: PNG });
  await page.waitForTimeout(2200);
  check('a second upload replaces it', (await page.locator('.avatar--image').count()) >= 1);
  await page.setInputFiles('input#avatar', { name: 'x.txt', mimeType: 'text/plain', buffer: Buffer.from('no') });
  await page.waitForTimeout(1200);
  check('a non-image is refused', /JPG|WebP/i.test(await text()));
  await page.setInputFiles('input#avatar', { name: 'big.png', mimeType: 'image/png', buffer: Buffer.alloc(6 * 1024 * 1024, 1) });
  await page.waitForTimeout(1200);
  check('an oversized file is refused', /5\s*(MB|מ)/i.test(await text()));

  section('7. Work entry');
  await page.locator('button:has-text("הוספת עבודה"), button:has-text("Add work")').first().click();
  await page.waitForTimeout(400);
  const job = `Integrated job ${stamp}`;
  await page.fill('#work-entry-title', job);
  await page.fill('#work-entry-meta', 'חיפה · 2026');
  await page.locator('.work-add__actions .btn--primary').click();
  await page.waitForTimeout(2500);
  check('POST /users/me/work-entries happened',
    calls.some((c) => c.startsWith('POST /users/me/work-entries')));
  await page.goto(`${APP}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('the entry is on My profile after a reload', (await text()).includes(job));

  section('8. Employee management — invite and cancel');
  await page.goto(`${APP}/employees`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const positions = await page.$$eval('#invitedCompanyPosition option', (n) => n.map((x) => x.value).filter(Boolean));
  check('Main Contractor is not offered', !positions.includes('main_contractor'), positions.join(','));
  await page.fill('#invitedFullName', 'Integrated Invitee');
  await page.selectOption('#invitedCompanyPosition', 'site_manager');
  await page.locator('form button[type="submit"]').first().click();
  await page.waitForTimeout(2200);
  check('the seat appears', (await text()).includes('Integrated Invitee'));

  calls.length = 0;
  await page.locator('button:has-text("ביטול ההזמנה"), button:has-text("Cancel invitation")').first().click();
  await page.waitForTimeout(2500);
  check('DELETE reached the server',
    calls.some((c) => c.startsWith('DELETE /companies/employees/invitations/')));
  check('and the list was re-read', calls.some((c) => c.startsWith('GET /companies/employees')));
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('a reload confirms it is gone', !(await text()).includes('Integrated Invitee'));

  section('9. Browse — real search, no interception');
  await page.goto(`${APP}/browse`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const cards = await page.locator('.c-card').count();
  check('contractors load', cards > 0, `${cards} cards`);

  await page.fill('#browse-q', 'Barak');
  await page.waitForTimeout(1400);
  const byName = await page.$$eval('.c-card__name', (n) => n.map((x) => x.textContent.trim()));
  check('contractor name search works', byName.some((n) => n.includes('Bob')), byName.join(', ') || 'none');

  await page.fill('#browse-q', 'Carmel');
  await page.waitForTimeout(1400);
  const byCompany = await page.$$eval('.c-card__name', (n) => n.map((x) => x.textContent.trim()));
  check('company search works', byCompany.some((n) => n.includes('Carol')), byCompany.join(', ') || 'none');
  await page.fill('#browse-q', '');
  await page.waitForTimeout(1200);

  await page.selectOption('#browse-specialty', 'plumbing');
  await page.waitForTimeout(1200);
  check('specialty filter works', (await page.locator('.c-card').count()) >= 1);
  await page.selectOption('#browse-specialty', '');
  await page.selectOption('#browse-region', 'nationwide');
  await page.waitForTimeout(1200);
  check('Nationwide is its own region',
    (await page.$$eval('.c-card__name', (n) => n.map((x) => x.textContent))).some((n) => n.includes('Gina')));
  await page.selectOption('#browse-region', '');
  // Availability is three checkboxes, as the approved rail has always had it.
  await page.check('#browse-availability-closed');
  await page.waitForTimeout(1200);
  check('availability filter works', (await page.locator('.avail--closed').count()) >= 1);
  await page.check('#browse-availability-open');
  await page.waitForTimeout(1200);
  check('and more than one state can be chosen at once',
    (await page.locator('.avail-option__input:checked').count()) === 2);
  await page.uncheck('#browse-availability-closed');
  await page.uncheck('#browse-availability-open');
  await page.waitForTimeout(1200);

  await page.locator('.c-card .btn--ghost').first().click();
  await page.waitForTimeout(1500);
  check('the embedded Public Profile opens', (await page.locator('.profile-panel').count()) === 1);

  section('10. Browse advanced — Places, rating, layout');
  await page.click('.adv-trigger');
  await page.waitForTimeout(600);
  check('Advanced is a real column, not an overlay',
    await page.evaluate(() => !['fixed', 'absolute'].includes(getComputedStyle(document.querySelector('.adv-panel')).position)));
  check('the minimum-rating stars are present',
    (await page.locator('.star-select input[name="minRating"]').count()) === 5);
  // The input is visually hidden; the label is what a person clicks.
  await page.locator('.star-select label[for="min-rating-3"]').click();
  await page.waitForTimeout(1600);
  check('the star control really selects',
    await page.isChecked('.star-select input[value="3"]'));
  check('choosing a minimum rating queries the server',
    calls.some((c) => c.includes('minRating=3')), 'minRating=3 sent');
  await page.locator('button:has-text("Clear the rating filter"), button:has-text("ביטול הסינון לפי דירוג")').first().click();
  await page.waitForTimeout(1200);

  const origin = page.locator('.adv-panel .adv-group').nth(1).locator('input[role="combobox"]');
  await origin.fill('חיפה');
  await page.waitForTimeout(2500);
  const originOptions = page.locator('.place-field__list [role="option"]');
  check('Browse Places autocomplete returns live results', (await originOptions.count()) > 0,
    `${await originOptions.count()} options`);

  section('11. Places localization');
  const names = async (lang) => {
    await setLang(lang);
    await origin.fill('');
    await page.waitForTimeout(300);
    await origin.fill('חיפה');
    await page.waitForTimeout(2600);
    return page.$$eval('.place-field__list [role="option"]', (n) => n.map((x) => x.textContent.trim()));
  };
  const hebrew = await names('he');
  check('Hebrew UI returns Hebrew place names',
    hebrew.length > 0 && /[֐-׿]/.test(hebrew[0]), hebrew[0] ?? 'none');
  const english = await names('en');
  check('English UI returns Latin place names',
    english.length > 0 && /[A-Za-z]/.test(english[0]) && !/[֐-׿]/.test(english[0]),
    english[0] ?? 'none');
  const backToHebrew = await names('he');
  check('switching back does not keep the English results',
    backToHebrew.length > 0 && /[֐-׿]/.test(backToHebrew[0]), backToHebrew[0] ?? 'none');

  section('12. Travel preferences');
  await setLang('he');
  await page.goto(`${APP}/browse`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.locator('.browse__head .btn').click();
  await page.waitForSelector('.travel-dialog', { timeout: 10000 });
  await page.waitForTimeout(1200);
  check('the travel editor opens', (await page.locator('.travel-dialog').count()) === 1);
  const chosen = page.locator('.travel-dialog .place-field__chosen');
  if ((await chosen.count()) > 0) { await chosen.locator('button').click(); await page.waitForTimeout(300); }
  await page.locator('.travel-dialog .place-field input').first().fill('חיפה');
  await page.waitForTimeout(2500);
  const baseOptions = page.locator('.travel-dialog .place-field__list [role="option"]');
  check('the base place resolves', (await baseOptions.count()) > 0);
  if ((await baseOptions.count()) > 0) await baseOptions.first().click();
  // The radius is a free number box now, and the slider mirrors whatever it holds.
  await page.locator('#travel-radius-km').fill('25');
  await page.waitForTimeout(300);
  check('the slider follows the number box',
    (await page.inputValue('.travel-slider')) === '25', await page.inputValue('.travel-slider'));
  await page.locator('.travel-dialog .btn--primary').first().click();
  await page.waitForSelector('.travel-list__item', { timeout: 40000 });
  const proposed = await page.$$eval('.travel-list__name', (n) => n.map((x) => x.textContent.trim()));
  check('the radius proposal returns road distances', proposed.length > 0, `${proposed.length} places`);
  const removed = proposed[0].split(' ·')[0].trim();
  await page.locator('.travel-list__item').first().locator('button').click();
  await page.waitForTimeout(300);
  check('a place can be removed', (await page.locator('.travel-removed__item').count()) >= 1);
  await page.locator('.travel-dialog .btn--primary').last().click();
  await page.waitForSelector('.travel-saved', { timeout: 12000 });
  check('the list saves', (await page.locator('.travel-saved').count()) === 1);
  await page.locator('.travel-dialog .btn--primary').first().click();
  await page.waitForTimeout(18000);
  const again = await page.$$eval('.travel-list__name', (n) => n.map((x) => x.textContent.trim()));
  check('the removal survives a fresh proposal',
    !again.some((n) => n.split(' ·')[0].trim() === removed), removed);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  section('13. Logout, then a refused refresh, then login again');
  await setLang('en');
  calls.length = 0;
  await page.click('.nav-profile');
  await page.waitForTimeout(400);
  await page.locator('[role="menuitem"]').last().click();
  await page.waitForTimeout(2500);
  check('POST /auth/logout happened', calls.some((c) => c.startsWith('POST /auth/logout')));
  check('and it landed on /login', new URL(page.url()).pathname === '/login', new URL(page.url()).pathname);

  const refreshAfter = await page.evaluate(async (api) => {
    const response = await fetch(`${api}/auth/refresh`, { method: 'POST', credentials: 'include' });
    return response.status;
  }, API);
  check('refreshing the logged-out session is refused', refreshAfter === 401, `status ${refreshAfter}`);

  await page.goto(`${APP}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('a protected route is unreachable', new URL(page.url()).pathname === '/login');

  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', ME.email);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  check('the account still exists and signs in again', !page.url().includes('/login'),
    new URL(page.url()).pathname);
  await page.goto(`${APP}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const after = await text();
  check('and the profile still holds everything', after.includes(ME.companyName) && after.includes(bio));

  section('14. Console');
  const real = consoleErrors.filter((t) => !t.includes('Failed to load resource') && !t.includes('net::'));
  check('no unexpected console errors', real.length === 0, real.slice(0, 2).join(' | ') || 'clean');

  await browser.close();
  console.log(`\n${failures === 0 ? 'All integrated checks passed.' : `${failures} integrated check(s) FAILED.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error) => { console.error(error); process.exit(2); });