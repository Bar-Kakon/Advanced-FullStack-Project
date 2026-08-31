/**
 * Real-browser proof of the two-step Register screen, against the real API.
 *
 * Step 1 opens with the registration route and shows only that route's taxonomy. Step 2 is the
 * email-delivery choice, with neither option preselected. Both accounts are created through the
 * screen itself — nothing is seeded behind its back.
 *
 *   npm run verify:register-ui
 */
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'CorrectHorse42!';
const FORBIDDEN_HE = ['בחרו', 'הזינו', 'אישרתם', 'הסרתם', 'ברצונכם', 'בחר/י', 'הזן/י', 'לכם', 'שלכם'];

/** Labels the father's list removed. None may appear on the screen in any route. */
const RETIRED_HE = ['קבלנות כללית', 'ממ"ד', 'מיזוג אוויר', 'עבודות עפר', 'אספקה וחומרים', 'קונגו'];

const stamp = Date.now();
const account = (role) => ({
  firstName: 'Reg',
  lastName: `${role}${stamp}`,
  companyName: `${role} Co ${stamp}`,
  email: `reg.${role.toLowerCase()}.${stamp}@example.com`,
});
const SUPPLIER = account('Supplier');
const CONTRACTOR = account('Contractor');

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(70)} ${detail}`);
};
const section = (t) => console.log(`\n${t}`);

const overflow = (page) =>
  page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

const optionLabels = async (page, selector) =>
  page.$$eval(`${selector} option`, (nodes) => nodes.map((n) => n.textContent.trim()));

/** Fills every Step 1 field except the route and the specialty, which each test chooses itself. */
const fillDetails = async (page, who) => {
  await page.fill('#firstName', who.firstName);
  await page.fill('#lastName', who.lastName);
  await page.selectOption('#standing', 'owner').catch(() => {});
  await page.fill('#companyName', who.companyName);
  await page.fill('#email', who.email);
  await page.fill('#password', PASSWORD);
  await page.fill('#password-confirm', PASSWORD);
  const cityBox = page.locator('.place-field input[role="combobox"]');
  const opts = page.locator('.place-field__list [role="option"]');
  for (let attempt = 0; attempt < 4 && (await opts.count()) === 0; attempt += 1) {
    await cityBox.fill('');
    await cityBox.type('חיפה', { delay: 60 });
    await page.waitForTimeout(2500);
  }
  if (await opts.count()) await opts.first().click();
  await page.selectOption('#region', 'haifa').catch(() => {});
};

const run = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  section('1. Two steps, and the route is the first thing asked');
  await page.goto(`${APP}/register`, { waitUntil: 'networkidle' });
  check('the step list names exactly two steps', (await page.locator('.reg-steps__item').count()) === 2);
  check('Step 1 is the current one',
    (await page.locator('.reg-steps__item--current .reg-steps__label').textContent()) === 'פרטי חשבון ועסק');
  check('the route selector is present', (await page.locator('#registrationCategory').count()) === 1);
  check('the route offers exactly the three approved routes',
    (await optionLabels(page, '#registrationCategory')).length === 4);
  check('and names them as the father did',
    (await optionLabels(page, '#registrationCategory')).join('|')
      .includes('קבלנים / בעלי מקצוע מבצעים|קטגוריה אדריכלית / בעלי מקצוע|ספקים'));
  check('no specialty list is shown before a route is chosen',
    (await page.locator('#specialty').count()) === 0);
  check('Step 2 controls are not on Step 1',
    (await page.locator('#operationalEmail-accept').count()) === 0);

  section('2. Each route offers only its own taxonomy');
  await page.selectOption('#registrationCategory', 'supplier');
  await page.waitForTimeout(300);
  const supplierList = await optionLabels(page, '#specialty');
  check('the supplier route lists ספק שיש', supplierList.includes('ספק שיש'));
  check('and מפעלי שליכט צבעוני', supplierList.includes('מפעלי שליכט צבעוני'));
  check('and does not offer עבודות חשמל', !supplierList.includes('עבודות חשמל'));
  check('and does not offer אדריכל', !supplierList.includes('אדריכל'));
  check('the supplier route carries its own אחר', supplierList.filter((l) => l === 'אחר').length === 1);

  await page.selectOption('#registrationCategory', 'architectural');
  await page.waitForTimeout(300);
  const architecturalList = await optionLabels(page, '#specialty');
  check('the architectural route lists קונסטרוקטור', architecturalList.includes('קונסטרוקטור'));
  check('and יועץ קרקע / יועץ אדמה', architecturalList.includes('יועץ קרקע / יועץ אדמה'));
  check('and does not offer ספק שיש', !architecturalList.includes('ספק שיש'));

  await page.selectOption('#registrationCategory', 'contractor');
  await page.waitForTimeout(300);
  const contractorList = await optionLabels(page, '#specialty');
  check('the contractor route lists קבלן שלד', contractorList.includes('קבלן שלד'));
  check('and עבודות רובה', contractorList.includes('עבודות רובה'));
  check('and משאבות בטון', contractorList.includes('משאבות בטון'));
  check('and כלי צמ״ה', contractorList.includes('כלי צמ״ה'));
  check('and does not offer ספק דלתות', !contractorList.includes('ספק דלתות'));

  const everyLabel = [...supplierList, ...architecturalList, ...contractorList];
  for (const retired of RETIRED_HE) {
    check(`the retired label ${retired} appears in no route`, !everyLabel.some((l) => l.includes(retired)));
  }
  check('קידוחי צנרת ניקוז is not a contractor specialty',
    !contractorList.some((l) => l.includes('קידוחי צנרת ניקוז')));

  section('3. Refinements sit under the profession that carries them');
  await page.selectOption('#specialty', 'drilling');
  await page.waitForTimeout(300);
  check('קבלן קידוחים reveals its nested subtype',
    await page.locator('#drillingTypes-injection_pvc').isVisible());
  check('and the subtype is the approved one',
    (await page.locator('label[for="drillingTypes-injection_pvc"]').textContent()).includes('קידוחי החדרה וצנרת PVC'));
  await page.selectOption('#specialty', 'electrical');
  await page.waitForTimeout(300);
  check('changing profession takes the subtype with it',
    (await page.locator('#drillingTypes-injection_pvc').count()) === 0);

  await page.selectOption('#specialty', 'contractor_other');
  await page.waitForTimeout(300);
  check('the route\'s own אחר reveals a free-text box',
    await page.locator('input[name="specialtyOther"]').isVisible());
  await page.selectOption('#specialty', 'electrical');
  await page.waitForTimeout(300);
  check('and a named profession hides it again',
    (await page.locator('input[name="specialtyOther"]').count()) === 0);

  section('4. Step 1 gates Step 2');
  check('Continue is disabled while Step 1 is incomplete',
    await page.locator('#register-next').isDisabled());
  await page.selectOption('#registrationCategory', 'supplier');
  await page.selectOption('#specialty', 'stone_supplier');
  await fillDetails(page, SUPPLIER);
  await page.waitForTimeout(400);
  check('and enabled once it is complete', await page.locator('#register-next').isEnabled());
  check('no horizontal overflow on Step 1', (await overflow(page)) <= 0, String(await overflow(page)));

  section('5. Step 2 is the email choice, with neither option preselected');
  await page.click('#register-next');
  await page.waitForTimeout(500);
  check('Step 2 is now the current step',
    (await page.locator('.reg-steps__item--current .reg-steps__label').textContent()) === 'התראות בדוא״ל');
  const stepTwoText = await page.locator('.email-choice').textContent();
  check('the approved wording is shown in full',
    stepTwoText.includes('Blokta יכולה לשלוח הודעות תפעוליות בדוא״ל')
    && stepTwoText.includes('ההתראות עצמן יופיעו גם בתוך Blokta')
    && stepTwoText.includes('אפשר לבחור שלא לקבל הודעות בדוא״ל ולהמשיך להשתמש במערכת כרגיל'));
  check('both options are offered',
    stepTwoText.includes('קבלת הודעות תפעוליות בדוא״ל')
    && stepTwoText.includes('הסתמכות על ההתראות בתוך Blokta בלבד'));
  check('accepting is not preselected', !(await page.locator('#operationalEmail-accept').isChecked()));
  check('declining is not preselected either', !(await page.locator('#operationalEmail-decline').isChecked()));
  check('and the choice is stated as changeable later', stepTwoText.includes('הגדרות ההתראות'));
  check('submit is disabled while neither option is answered',
    await page.locator('.reg-nav button[type="submit"]').isDisabled());

  const forbidden = [];
  const stepTwoPage = await page.textContent('body');
  for (const word of FORBIDDEN_HE) if (stepTwoPage.includes(word)) forbidden.push(word);
  check('Step 2 addresses one person, in no plural form', forbidden.length === 0, forbidden.join(','));
  check('no horizontal overflow on Step 2', (await overflow(page)) <= 0, String(await overflow(page)));

  section('6. The Terms of Use open in a dialog, and close without costing anything');
  check('the consent control names one document, not a second one that does not exist',
    (await page.locator('.checkbox-label').innerText()).includes('תנאי השימוש'));
  check('no Privacy Policy is named — no such document is published',
    !(await page.locator('.checkbox-label').innerText()).includes('מדיניות הפרטיות'));
  const opener = page.locator('button.checkbox-label__doc');
  check('the document opens from a button, not a link that would navigate away',
    (await opener.count()) === 1);
  check('the dialog is absent until it is asked for', (await page.locator('.terms-modal').count()) === 0);

  const accepted = await page.locator('input[name="acceptedTerms"]').isChecked();
  await opener.click();
  await page.waitForTimeout(300);
  check('clicking it opens a modal dialog', (await page.locator('.terms-modal[role="dialog"][aria-modal="true"]').count()) === 1);
  check('the dialog is labelled by its own title', (await page.locator('#terms-title').count()) === 1);
  check('opening the document did not toggle consent',
    (await page.locator('input[name="acceptedTerms"]').isChecked()) === accepted);
  check('the URL never left Register', new URL(page.url()).pathname === '/register', page.url());

  const termsText = await page.locator('.terms-modal__body').innerText();
  check('the terms carry real approved content, not a placeholder',
    termsText.length > 400 && !/lorem|TBD|placeholder/i.test(termsText), String(termsText.length));
  check('and they say the entered information does not replace professional responsibility',
    termsText.includes('אינו מחליף אחריות מקצועית'));
  check('the body is the scrolling region, so a long document stays readable',
    await page.locator('.terms-modal__body').evaluate((n) => getComputedStyle(n).overflowY === 'auto'));
  check('the version being agreed to is named', (await page.locator('.terms-modal__version').innerText()).includes('2026-08-31'));

  await page.keyboard.press('Escape');
  await page.waitForTimeout(300);
  check('Escape closes it', (await page.locator('.terms-modal').count()) === 0);
  check('Step 2 is still the current step — nothing navigated',
    (await page.locator('.email-choice').count()) === 1
    && (await page.locator('.reg-steps__item--current .reg-steps__label').textContent()) === 'התראות בדוא״ל');

  await opener.click();
  await page.waitForTimeout(250);
  // Near the corner, not the centre: the backdrop spans the viewport and the panel sits over its
  // middle, so the exposed part is the margin around the panel — which is where a reader clicks.
  await page.locator('.terms-modal__backdrop').click({ position: { x: 6, y: 6 } });
  await page.waitForTimeout(250);
  check('the backdrop closes it too', (await page.locator('.terms-modal').count()) === 0);

  section('7. Back keeps what Step 1 already holds');
  await page.click('#register-back');
  await page.waitForTimeout(400);
  check('Back returns to Step 1', (await page.locator('#registrationCategory').count()) === 1);
  check('the route is still the one chosen',
    (await page.locator('#registrationCategory').inputValue()) === 'supplier');
  check('and so is the specialty',
    (await page.locator('#specialty').inputValue()) === 'stone_supplier');
  check('and the email typed on Step 1', (await page.locator('#email').inputValue()) === SUPPLIER.email);

  section('8. Declining email still creates the account');
  await page.click('#register-next');
  await page.waitForTimeout(400);
  await page.check('#operationalEmail-decline');
  const terms = page.locator('input[type="checkbox"]');
  for (let i = 0; i < (await terms.count()); i += 1) await terms.nth(i).check().catch(() => {});
  await page.waitForTimeout(300);
  check('submit is enabled once an option and the Terms are answered',
    await page.locator('.reg-nav button[type="submit"]').isEnabled());
  await page.click('.reg-nav button[type="submit"]');
  await page.waitForTimeout(3000);
  check('registration completes and lands on Login', page.url().includes('/login'), page.url());

  const signIn = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: SUPPLIER.email, password: PASSWORD }),
  });
  check('the account exists and signs in', signIn.status === 200, String(signIn.status));
  const token = (await signIn.json()).accessToken;
  const me = await fetch(`${API}/users/me`, { headers: { Authorization: `Bearer ${token}` } });
  const profile = (await me.json()).user;
  check('the supplier route was stored', profile.registrationCategory === 'supplier',
    profile.registrationCategory);
  check('and the refusal of email was recorded rather than defaulted',
    profile.operationalEmail === false, String(profile.operationalEmail));

  section('9. A contractor registers, and Browse tells the two apart');
  const second = await context.newPage();
  await second.goto(`${APP}/register`, { waitUntil: 'networkidle' });
  await second.selectOption('#registrationCategory', 'contractor');
  await second.selectOption('#specialty', 'electrical');
  await fillDetails(second, CONTRACTOR);
  await second.waitForTimeout(400);
  await second.click('#register-next');
  await second.waitForTimeout(500);
  await second.check('#operationalEmail-accept');
  const terms2 = second.locator('input[type="checkbox"]');
  for (let i = 0; i < (await terms2.count()); i += 1) await terms2.nth(i).check().catch(() => {});
  await second.click('.reg-nav button[type="submit"]');
  await second.waitForTimeout(3000);
  await second.fill('#email', CONTRACTOR.email);
  await second.fill('#password', PASSWORD);
  await second.click('button[type="submit"]');
  await second.waitForTimeout(2500);

  await second.goto(`${APP}/browse`, { waitUntil: 'networkidle' });
  await second.waitForTimeout(2000);
  check('Browse offers a route filter', (await second.locator('#browse-category').count()) === 1);
  const routeOptions = await optionLabels(second, '#browse-category');
  check('naming all three routes', routeOptions.length === 4, routeOptions.join(' · '));

  await second.fill('#browse-q', SUPPLIER.lastName);
  await second.waitForTimeout(1800);
  const supplierCard = second.locator('.c-card').first();
  check('the supplier is discoverable in Browse', (await second.locator('.c-card').count()) > 0);
  check('and their card names the route rather than reading as a contractor',
    (await supplierCard.locator('.tag--route').textContent()) === 'ספקים');

  await second.selectOption('#browse-category', 'contractor');
  await second.waitForTimeout(1800);
  check('filtering to contractors drops the supplier',
    (await second.locator('.c-card').count()) === 0);

  await second.fill('#browse-q', '');
  await second.selectOption('#browse-category', 'supplier');
  await second.waitForTimeout(1800);
  const shownRoutes = await second.$$eval('.tag--route', (n) => [...new Set(n.map((x) => x.textContent))]);
  check('filtering to suppliers returns only suppliers',
    shownRoutes.length === 1 && shownRoutes[0] === 'ספקים', shownRoutes.join(','));
  const grouped = await second.$$eval('#browse-specialty optgroup', (n) => n.map((x) => x.label));
  check('and the specialty list narrows to that route',
    grouped.length === 1 && grouped[0] === 'ספקים', grouped.join(','));

  section('10. Narrow viewport');
  const small = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const mobile = await small.newPage();
  await mobile.goto(`${APP}/register`, { waitUntil: 'networkidle' });
  await mobile.waitForTimeout(600);
  check('no horizontal overflow at 390px', (await overflow(mobile)) <= 0, String(await overflow(mobile)));
  check('the step list is still readable', (await mobile.locator('.reg-steps__item').count()) === 2);

  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
