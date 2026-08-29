/**
 * Real-browser proof that the profile screens show the person's own data and nothing invented.
 *
 * Register → Login → My profile → Edit profile → save → reload, checking at every step that the
 * values on screen are the values that were typed. Needs the API and the dev server running.
 *
 *   npm run verify:profile-data
 */
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:3000/api';

/** Values from the retired prototype. None of them may ever appear on a real account. */
const NEVER = [
  'כאכון בנייה בע״מ', 'Kakon Construction Ltd.', '04-8123456', '052-555-0123',
  'מגדלי הצפון', 'Northern Towers', 'Concrete and formwork', 'בטון ותבניות',
];

const stamp = Date.now();
const ENTERED = {
  firstName: 'Real', lastName: `Person${stamp}`,
  companyName: `Real Company ${stamp}`,
  email: `profile-data-verify.${stamp}@example.com`,
  password: 'CorrectHorse42!',
  city: 'רעננה', region: 'sharon', specialty: 'electrical',
  officePhone: '0500000003', businessPhone: '0500000002',
};

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(62)} ${detail}`);
};
const section = (title) => console.log(`\n${title}`);

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const run = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  section('1. Register through the browser with traceable values');
  await page.goto(`${APP}/register`, { waitUntil: 'networkidle' });
  await page.fill('#firstName', ENTERED.firstName);
  await page.fill('#lastName', ENTERED.lastName);
  await page.selectOption('#standing', 'owner').catch(() => {});
  await page.fill('#companyName', ENTERED.companyName);
  await page.fill('#email', ENTERED.email);
  await page.fill('#password', ENTERED.password);
  await page.fill('#password-confirm', ENTERED.password);
  await page.selectOption('#specialty', ENTERED.specialty).catch(() => {});
  // The city box is the shared structured place field now, so a place is chosen rather than typed.
  const cityBox = page.locator('.place-field input[role="combobox"]');
  await cityBox.fill(ENTERED.city);
  await page.waitForTimeout(2200);
  const cityOptions = page.locator('.place-field__list [role="option"]');
  if ((await cityOptions.count()) > 0) await cityOptions.first().click();
  await page.selectOption('#region', ENTERED.region).catch(() => {});
  await page.fill('#officePhone', ENTERED.officePhone).catch(() => {});
  await page.fill('#businessPhone', ENTERED.businessPhone).catch(() => {});
  const boxes = page.locator('input[type="checkbox"]');
  for (let i = 0; i < (await boxes.count()); i += 1) await boxes.nth(i).check().catch(() => {});
  await page.click('button[type="submit"]');
  await page.waitForTimeout(3000);
  check('registration reached a next screen', !page.url().includes('/register'), new URL(page.url()).pathname);

  section('2. Log in and open My profile');
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', ENTERED.email);
  await page.fill('#password', ENTERED.password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  const apiCalls = [];
  page.on('request', (r) => {
    const url = r.url();
    if (url.startsWith(API)) apiCalls.push(`${r.method()} ${url.slice(API.length)}`);
  });

  await page.goto(`${APP}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const shown = await page.evaluate(() => document.body.innerText);

  check('My profile asks the API for the profile',
    apiCalls.some((call) => call.startsWith('GET /users/me')), apiCalls.join(' | ') || 'no calls');
  check('it shows the company name that was typed', shown.includes(ENTERED.companyName));
  check('it shows the office phone that was typed', shown.includes(ENTERED.officePhone));
  check('it shows the business phone that was typed', shown.includes(ENTERED.businessPhone));
  check('it shows the place that was chosen', shown.includes(ENTERED.city));
  check('it shows the name that was typed', shown.includes(ENTERED.lastName));

  const leaked = NEVER.filter((value) => shown.includes(value));
  check('no prototype value appears anywhere', leaked.length === 0, leaked.join(', ') || 'none');
  check('an unset rating shows the neutral mark, not a number',
    !/\b4\.6\b/.test(shown), 'no invented score');

  section('3. Edit profile loads the same real values');
  await page.goto(`${APP}/profile/edit`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('company name is in the box', (await page.inputValue('#companyName')) === ENTERED.companyName);
  check('office phone is in the box', (await page.inputValue('#officePhone')) === ENTERED.officePhone);
  check('business phone is in the box', (await page.inputValue('#businessPhone')) === ENTERED.businessPhone);
  const chosenCity = await page.locator('.place-field__name').first().textContent().catch(() => null);
  check('the chosen place is shown on the edit screen',
    (chosenCity ?? '').includes(ENTERED.city), chosenCity ?? 'none');
  check('region is selected', (await page.inputValue('#region')) === ENTERED.region);
  const editShown = await page.evaluate(() => document.body.innerText);
  check('no prototype value on the edit screen',
    NEVER.every((value) => !editShown.includes(value)));

  section('4. Saving writes to the server');
  const newBio = `Bio written at ${stamp}`;
  await page.fill('#bio', newBio);
  await page.fill('#businessPhone', '0500000009');
  await page.fill('#companyName', `${ENTERED.companyName} X`);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  const afterSave = await page.evaluate(() => document.body.innerText);
  check('the screen confirms the save', /נשמרו|saved/i.test(afterSave), 'confirmation shown');
  check('it patched the person', apiCalls.some((c) => c.startsWith('PATCH /users/me')));
  check('and patched the company', apiCalls.some((c) => c.startsWith('PATCH /companies/me')));

  section('5. The change survives a reload');
  await page.goto(`${APP}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const reloaded = await page.evaluate(() => document.body.innerText);
  check('the new bio is there', reloaded.includes(newBio));
  check('the new business phone is there', reloaded.includes('0500000009'));
  check('the new company name is there', reloaded.includes(`${ENTERED.companyName} X`));
  check('the office phone was left alone', reloaded.includes(ENTERED.officePhone));

  section('6. Avatar upload, replace, delete and persistence');
  await page.goto(`${APP}/profile/edit`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('a file input exists', (await page.locator('input#avatar').count()) === 1);

  await page.setInputFiles('input#avatar', { name: 'a.png', mimeType: 'image/png', buffer: PNG });
  await page.waitForTimeout(2500);
  check('the upload used multipart PUT', apiCalls.some((c) => c.startsWith('PUT /users/me/avatar')));
  check('an image element replaced the initials',
    (await page.locator('.avatar--image').count()) >= 1);

  await page.goto(`${APP}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('the picture is still there after a reload',
    (await page.locator('.avatar--image').count()) >= 1);

  await page.goto(`${APP}/profile/edit`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.setInputFiles('input#avatar', { name: 'b.jpg', mimeType: 'image/jpeg', buffer: PNG });
  await page.waitForTimeout(2500);
  check('a second upload replaces the first',
    (await page.locator('.avatar--image').count()) >= 1);

  await page.setInputFiles('input#avatar', {
    name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not an image'),
  });
  await page.waitForTimeout(1500);
  const rejected = await page.evaluate(() => document.body.innerText);
  check('a non-image is refused with a message', /JPG|WebP/i.test(rejected), 'type refused');
  check('and the stored picture is untouched', (await page.locator('.avatar--image').count()) >= 1);

  const big = Buffer.alloc(6 * 1024 * 1024, 1);
  await page.setInputFiles('input#avatar', { name: 'big.png', mimeType: 'image/png', buffer: big });
  await page.waitForTimeout(1500);
  const tooBig = await page.evaluate(() => document.body.innerText);
  check('an oversized file is refused with a message', /5\s*(MB|מ)/i.test(tooBig), 'size refused');

  await page.locator('.avatar-row__actions button').first().click();
  await page.waitForTimeout(2000);
  check('deleting the picture calls the API',
    apiCalls.some((c) => c.startsWith('DELETE /users/me/avatar')));
  await page.goto(`${APP}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  check('and after a reload the initials are back',
    (await page.locator('.avatar--image').count()) === 0);

  section('7. Completed work is real, not a mock');
  await page.goto(`${APP}/profile/edit`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  await page.locator('button:has-text("הוספת עבודה"), button:has-text("Add work")').first().click();
  await page.waitForTimeout(400);
  const workTitle = `Job ${stamp}`;
  await page.fill('#work-entry-title', workTitle);
  await page.fill('#work-entry-meta', 'חיפה · 2026');
  await page.locator('.work-add__actions .btn--primary').click();
  await page.waitForTimeout(2500);
  check('adding an entry posts it', apiCalls.some((c) => c.startsWith('POST /users/me/work-entries')));

  await page.goto(`${APP}/profile`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const withWork = await page.evaluate(() => document.body.innerText);
  check('the entry is on My profile after a reload', withWork.includes(workTitle));
  check('and no prototype entry came with it',
    !withWork.includes('מגדלי הצפון') && !withWork.includes('Northern Towers'));

  await browser.close();
  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error) => { console.error(error); process.exit(2); });
