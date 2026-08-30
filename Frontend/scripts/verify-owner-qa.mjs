/**
 * Real-browser proof for the owner-QA corrections.
 *
 * Needs the API and the dev server running.
 *
 *   npm run verify:owner-qa
 */
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'CorrectHorse42!';

const stamp = Date.now();
// The surname carries the run stamp, because a name is not an identity and earlier runs of this
// same script are still in the database.
const ME = { first: 'Noam', last: `Peretz${stamp}`, email: `ownerqa-ui.${stamp}@example.com` };
const OTHER = { first: 'Dana', last: `Shalev${stamp}`, email: `ownerqa-ui.other.${stamp}@example.com` };

const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(62)} ${detail}`);
};
const section = (title) => console.log(`\n${title}`);

const register = async (who, extra = {}) => {
  const response = await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: who.first, lastName: who.last, standing: 'owner',
      companyName: `Owner QA ${who.first} ${stamp} Ltd`, email: who.email,
      password: PASSWORD, confirmPassword: PASSWORD,
      registrationCategory: 'contractor', specialty: 'electrical', city: 'חיפה', region: 'haifa',
      availability: 'open', acceptedTerms: true, operationalEmail: true, ...extra,
    }),
  });
  if (response.status !== 201) throw new Error(`register ${who.email}: ${response.status}`);
};

const signIn = async (page, who) => {
  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', who.email);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2200);
};

const setLang = async (page, lang) => {
  await page.click(`.lang-switch__btn:has-text("${lang === 'he' ? 'עב' : 'EN'}")`);
  await page.waitForTimeout(350);
};

const run = async () => {
  await register(ME);
  await register(OTHER);

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const pageErrors = [];
  page.on('pageerror', (error) => pageErrors.push(String(error)));

  await signIn(page, ME);

  /* ── Login's error language ─────────────────────────────────────────────────────────────── */
  section('1. Login speaks the same error language as Register');
  const fresh = await context.newPage();
  await fresh.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await fresh.fill('#email', 'not-an-address');
  await fresh.click('#password');
  await fresh.waitForTimeout(250);
  const loginError = await fresh.locator('#email ~ .field-error, .form-group:has(#email) .field-error').first();
  check('an invalid address gets a written message', await loginError.count() > 0);
  check('and it is actually visible',
    await loginError.first().isVisible().catch(() => false));

  const box = await fresh.locator('.form-group:has(#email) .field-error').first().boundingBox();
  check('drawn as a block, not bare text', box !== null && box.height > 24, `h=${box?.height ?? 0}`);
  await fresh.close();

  /* ── Edit profile ───────────────────────────────────────────────────────────────────────── */
  await page.goto(`${APP}/profile/edit`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  section('2. No engineering-status copy is on screen');
  const banned = [
    'not stored', 'לא תישמר', 'אינה נשמרת', 'not implemented', 'לא נבנה', 'עדיין לא נבנה',
    'no data model', 'מבנה נתונים',
  ];
  const editText = (await page.locator('main').innerText()).toLowerCase();
  for (const phrase of banned) {
    check(`Edit profile never says "${phrase}"`, !editText.includes(phrase.toLowerCase()));
  }

  section('3. Heavy equipment is a real, persisted choice');
  await page.click('.choice:has-text("צמ״ה"), .choice:has-text("Heavy equipment")');
  await page.waitForTimeout(300);
  check('choosing the trade reveals the picker', await page.locator('.equip-trigger').isVisible());
  await page.click('.equip-trigger');
  await page.waitForTimeout(300);
  await page.click('.equip-modal .choice:has-text("באגר"), .equip-modal .choice:has-text("Excavator")');
  await page.click('.equip-modal__done');
  await page.waitForTimeout(300);
  check('the chosen machine is shown back without opening the dialog',
    (await page.locator('.tags .tag').count()) > 0);

  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  const equipmentAfterReload = await page.locator('.tags .tag').allTextContents();
  check('and it survives a reload', equipmentAfterReload.length > 0, equipmentAfterReload.join(','));

  section('4. Travel radius takes any number in range, not a preset');
  await page.fill('#travelRadiusKm', '37');
  await page.waitForTimeout(200);
  check('37 is accepted in the box', (await page.inputValue('#travelRadiusKm')) === '37');
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2000);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1400);
  check('and 37 is what was saved', (await page.inputValue('#travelRadiusKm')) === '37');

  section('5. Clearing a saved location blocks Save rather than silently reverting');
  // A structured place is written through the API, because the browser Places key is not part of
  // what this test proves and the defect only exists once a place is actually saved.
  const token = await page.evaluate(async ([api, email, password]) => {
    const answer = await fetch(`${api}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include',
      body: JSON.stringify({ email, password }),
    });
    return (await answer.json()).accessToken;
  }, [API, ME.email, PASSWORD]);

  const placed = await fetch(`${API}/users/me`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      place: {
        placeId: `owner-qa-place-${stamp}`, displayName: 'חיפה',
        latitude: 32.794, longitude: 34.9896, city: 'חיפה',
      },
    }),
  });
  check('a structured place is saved for this account', placed.status === 200, String(placed.status));

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const clearLocation = page.locator('.place-field__chosen button').first();
  check('the saved place is shown with a way to clear it', (await clearLocation.count()) === 1);

  await clearLocation.click();
  await page.waitForTimeout(400);

  await page.click('button[type="submit"]');
  await page.waitForTimeout(1200);
  const aside = (await page.locator('.form-actions__aside').innerText()).trim();
  check('Save reports a blocked submission', /חסרים שדות חובה|Required fields are missing/.test(aside), aside);
  check('and it is announced as an alert',
    (await page.getAttribute('.form-actions__aside', 'role')) === 'alert');
  check('the field itself is marked invalid',
    (await page.locator('.place-field .form-input.touched').count()) > 0);
  check('a written reason sits under the field',
    (await page.locator('.place-field ~ .field-error--visible, .place-field .field-error--visible').count()) > 0
    || (await page.locator('.field-error--visible').count()) > 0);
  check('no success message is shown', !/נשמרו|have been saved/.test(aside));

  const stillThere = await fetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
  const stillPlaced = (await stillThere.json()).user.place;
  check('and nothing was sent, so the saved place is untouched',
    stillPlaced !== null && stillPlaced.placeId === `owner-qa-place-${stamp}`,
    stillPlaced?.placeId ?? 'null');

  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  /* ── Completed work ─────────────────────────────────────────────────────────────────────── */
  section('6. A completed-work entry can be added with a real photo');
  await page.click('.work-add');
  await page.waitForTimeout(300);
  await page.fill('#work-entry-title', 'Original job');
  await page.fill('#work-entry-meta', 'Haifa · 2025');
  await page.setInputFiles('#work-entry-image', { name: 'job.png', mimeType: 'image/png', buffer: PNG });
  await page.click('.work-add__actions .btn--primary');
  await page.waitForTimeout(2500);

  check('the tile is on the page', (await page.locator('.work-item').count()) >= 1);
  await page.waitForTimeout(1200);
  check('and it shows the stored photo, not a placeholder icon',
    (await page.locator('.work-item__thumb--image').count()) >= 1);

  section('7. It can be edited, with the MUI EditOutlined control');
  const editButtons = page.locator('.work-item__tools button').first();
  check('every tile carries an edit control', (await page.locator('.work-item__tools').count()) >= 1);
  check('drawn as an MUI icon button',
    (await page.locator('.work-item__tools .MuiIconButton-root').count()) >= 1);
  check('with an accessible name',
    ((await editButtons.getAttribute('aria-label')) ?? '').length > 0,
    await editButtons.getAttribute('aria-label'));

  await editButtons.click();
  await page.waitForTimeout(400);
  check('the form opens filled with what is saved',
    (await page.inputValue('#work-entry-title')) === 'Original job');

  await page.fill('#work-entry-title', 'Edited job');
  await page.click('.work-add__actions .btn--primary');
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  const titles = await page.locator('.work-item__title').allTextContents();
  check('and the edit survives a reload', titles.includes('Edited job'), titles.join(' | '));
  check('the old value is gone', !titles.includes('Original job'));

  /* ── Browse ─────────────────────────────────────────────────────────────────────────────── */
  await page.goto(`${APP}/browse`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  section('8. The searcher never appears in their own results');
  const names = await page.locator('.c-card__name').allTextContents();
  check('own name is absent from the first page', !names.includes(`${ME.first} ${ME.last}`),
    names.join(' | '));
  await page.fill('#browse-q', ME.last);
  await page.waitForTimeout(1500);
  const searched = await page.locator('.c-card__name').allTextContents();
  check('and absent when searching for it directly', !searched.includes(`${ME.first} ${ME.last}`),
    searched.join(' | '));
  await page.fill('#browse-q', '');
  await page.waitForTimeout(1500);

  section('9. The rail carries the approved filters');
  check('availability is multi-select, not one choice',
    (await page.locator('.avail-option__input').count()) === 3);
  await page.check('#browse-availability-open');
  await page.check('#browse-availability-limited');
  await page.waitForTimeout(1200);
  check('two states can be chosen at once',
    (await page.locator('.avail-option__input:checked').count()) === 2);
  await page.uncheck('#browse-availability-open');
  await page.uncheck('#browse-availability-limited');
  await page.waitForTimeout(1200);

  check('the Sort control is back', (await page.locator('#browse-sort').count()) === 1);
  const sortOptions = await page.locator('#browse-sort option').allTextContents();
  check('with the orders the product can actually produce', sortOptions.length === 2,
    sortOptions.join(' | '));

  section('10. No permanent distance disclaimer, and a short one when degraded');
  const browseText = await page.locator('main').innerText();
  check('nothing explains the maps service on a normal page',
    !/שירות המפות|maps-service|temporary maps/.test(browseText));
  check('and no degraded warning is shown when nothing is degraded',
    !/לא ניתן היה לחשב מרחק|Distance could not be calculated/.test(browseText));

  section('11. Advanced filters take a free distance value');
  await page.click('.adv-trigger');
  await page.waitForTimeout(500);
  check('minimum rating is present', (await page.locator('.star-select').count()) === 1);
  check('maximum driving distance is a number box, not a preset list',
    (await page.getAttribute('#browse-km', 'type')) === 'number');
  await page.fill('#browse-km', '37');
  check('and it accepts 37', (await page.inputValue('#browse-km')) === '37');
  await page.fill('#browse-km', '');
  await page.click('.adv-panel__close');
  await page.waitForTimeout(400);

  /* ── Travel preferences ─────────────────────────────────────────────────────────────────── */
  section('12. Travel preferences close with normal wording');
  await page.click('.browse__head-actions .btn--ghost');
  await page.waitForTimeout(1500);
  const travelText = await page.locator('.travel-dialog').innerText();
  check('the panel never says "closing the profile"', !travelText.includes('סגירת הפרופיל'), '');
  const closeLabel = (await page.locator('.travel-dialog .adv-panel__close').innerText()).trim();
  check('its close control says Close', /^(סגירה|Close)$/.test(closeLabel), closeLabel);

  section('13. The radius is a synchronised box and slider');
  check('a number box exists', (await page.locator('#travel-radius-km').count()) === 1);
  await page.fill('#travel-radius-km', '37');
  await page.waitForTimeout(300);
  check('37 is accepted', (await page.inputValue('#travel-radius-km')) === '37');
  const sliderValue = await page.inputValue('.travel-slider');
  check('and the slider followed it', sliderValue === '37', sliderValue);

  section('14. A cleared origin blocks the save');
  // A confirmed list is written through the API, so the confirm control this guard protects is on
  // screen without spending a Google call to produce one.
  const seeded = await fetch(`${API}/location/travel`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      travelRadiusKm: 50,
      basePlace: {
        placeId: `owner-qa-place-${stamp}`, displayName: 'חיפה', city: 'חיפה',
        latitude: 32.794, longitude: 34.9896, source: 'manual',
      },
      approvedTravelLocations: [{
        placeId: `owner-qa-approved-${stamp}`, displayName: 'עכו',
        latitude: 32.9281, longitude: 35.0818, source: 'manual',
      }],
    }),
  });
  check('an approved list is seeded for this account', seeded.status === 200, String(seeded.status));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  await page.click('.browse__head-actions .btn--ghost');
  await page.waitForTimeout(1800);

  const confirmButton = page.locator('.travel-dialog__foot .btn--primary');
  check('the confirm control is on screen', (await confirmButton.count()) === 1);

  const clearBase = page.locator('.travel-dialog .place-field__chosen button').first();
  check('the saved origin can be cleared', (await clearBase.count()) === 1);
  await clearBase.click();
  await page.waitForTimeout(400);

  await confirmButton.click();
  await page.waitForTimeout(1000);
  const warn = await page.locator('.travel-dialog .notice--warn').innerText().catch(() => '');
  check('it refuses and says why', /נקודת מוצא|starting point/i.test(warn), warn.trim());
  check('and claims no save', (await page.locator('.travel-saved').count()) === 0);

  const afterBlocked = await fetch(`${API}/location/travel`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const keptBase = (await afterBlocked.json()).basePlace;
  check('the stored origin is untouched, because nothing was sent',
    keptBase !== null && keptBase.placeId === `owner-qa-place-${stamp}`, keptBase?.placeId ?? 'null');

  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);

  /* ── Public profile ─────────────────────────────────────────────────────────────────────── */
  section('15. The embedded public profile is compact and honest');
  await page.click('.c-card .btn--ghost');
  await page.waitForTimeout(2000);
  check('it opened inside the grid, never as an overlay',
    (await page.locator('.profile-panel').count()) === 1);
  const panelText = await page.locator('.profile-panel').innerText();
  check('contact details are not explained away',
    !/נחשפים רק בפרויקט|They appear only on a shared project/.test(panelText));
  check('an identity block sits at the top',
    (await page.locator('.profile-panel .pp-identity').count()) === 1);
  check('with the rating summary beside it',
    (await page.locator('.profile-panel .pp-signals').count()) === 1);

  const panelBox = await page.locator('.profile-panel').boundingBox();
  const bodyBox = await page.locator('.profile-panel__body').boundingBox();
  const slack = panelBox && bodyBox ? panelBox.height - (bodyBox.y - panelBox.y + bodyBox.height) : 0;
  check('and no large empty area under its content', slack < 120, `${Math.round(slack)}px`);

  /* ── Navigation ─────────────────────────────────────────────────────────────────────────── */
  section('16. Nothing in the navbar pretends to work');
  check('no dead href="#" link remains',
    (await page.locator('.app-nav__link[href="#"]').count()) === 0);
  check('unbuilt destinations are present but inert',
    (await page.locator('.app-nav__link.is-disabled').count()) === 2);
  check('and My network is now a real destination',
    (await page.locator('.app-nav__link[href="/network"]').count()) === 1);
  check('the brand goes somewhere real',
    (await page.getAttribute('.app-nav__brand', 'href')) === '/dashboard');
  check('the bell claims no unread notifications',
    (await page.locator('.nav-icon-btn.has-dot').count()) === 0);

  section('17. The account menu carries the approved three items and no note');
  await page.click('.nav-profile');
  await page.waitForTimeout(500);
  const menuItems = await page.locator('[role="menu"] [role="menuitem"]').allTextContents();
  check('three items', menuItems.length === 3, menuItems.join(' | '));
  check('and no build-status note',
    !menuItems.join(' ').match(/לא נבנה|has not been built/), menuItems.join(' | '));
  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);

  /* ── Bilingual and responsive ───────────────────────────────────────────────────────────── */
  section('18. Both languages, both directions, three viewports');
  for (const lang of ['he', 'en']) {
    await setLang(page, lang);
    const dir = await page.getAttribute('html', 'dir');
    check(`${lang}: direction is on <html>`, dir === (lang === 'he' ? 'rtl' : 'ltr'), dir ?? '');

    for (const [width, height] of [[1440, 900], [820, 1180], [390, 844]]) {
      await page.setViewportSize({ width, height });
      await page.waitForTimeout(600);
      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`${lang} ${width}x${height}: no horizontal overflow`, overflow <= 1, `${overflow}px`);
    }
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  section('19. The screens raised no JavaScript errors');
  check('zero page errors', pageErrors.length === 0, pageErrors.join(' | '));

  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error(error);
  process.exit(2);
});