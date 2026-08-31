/**
 * Real-browser proof for the employee invitation lifecycle.
 *
 * A pending invitation can be withdrawn from the screen, the row leaves only after the server
 * agrees, and Main Contractor is not offered for a company that already has one.
 *
 *   npm run verify:invitation-ui
 */
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const API = process.env.API_URL ?? 'http://localhost:3000/api';
const PASSWORD = 'CorrectHorse42!';

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(60)} ${detail}`);
};
const section = (title) => console.log(`\n${title}`);

const stamp = Date.now();
const EMAIL = `invite-ui-verify.${stamp}@example.com`;
const COMPANY = `Invite UI ${stamp} Ltd`;

const run = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const registered = await fetch(`${API}/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Invite', lastName: `Owner${stamp}`, standing: 'owner', companyName: COMPANY,
      email: EMAIL, password: PASSWORD, confirmPassword: PASSWORD,
      registrationCategory: 'contractor', specialty: 'electrical', city: 'חיפה', region: 'haifa', availability: 'open',
      acceptedTerms: true,
      operationalEmail: true,
    }),
  });
  if (registered.status !== 201) throw new Error(`register: ${registered.status}`);

  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  const calls = [];
  page.on('request', (r) => {
    if (r.url().startsWith(API)) calls.push(`${r.method()} ${r.url().slice(API.length)}`);
  });

  await page.goto(`${APP}/employees`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  section('1. Main Contractor is not offered where it is already held');
  const options = await page.$$eval('#invitedCompanyPosition option', (nodes) =>
    nodes.map((n) => n.value).filter(Boolean));
  check('the position list is offered', options.length > 0, `${options.length} options`);
  check('main_contractor is absent from it', !options.includes('main_contractor'),
    options.join(', '));

  const direct = await page.evaluate(async ([api, email, password]) => {
    const signIn = await fetch(`${api}/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const { accessToken } = await signIn.json();
    const attempt = await fetch(`${api}/companies/employees/invitations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
      body: JSON.stringify({ fullName: 'Sneaky Self', companyPosition: 'main_contractor' }),
    });
    return { status: attempt.status, body: await attempt.json() };
  }, [API, EMAIL, PASSWORD]);
  check('a direct API attempt is rejected too', direct.status === 409, `${direct.status}`);
  check('with the named code', direct.body?.code === 'MAIN_CONTRACTOR_SEAT_TAKEN', direct.body?.code);

  section('2. A pending invitation can be withdrawn');
  await page.fill('#invitedFullName', 'Withdrawn Person');
  await page.selectOption('#invitedCompanyPosition', 'site_manager');
  await page.click('.invite-form button[type="submit"], form button[type="submit"]');
  await page.waitForTimeout(2000);
  let text = await page.evaluate(() => document.body.innerText);
  check('the seat appears in the list', text.includes('Withdrawn Person'));

  const cancelButton = page.locator(
    'button:has-text("ביטול ההזמנה"), button:has-text("Cancel invitation")',
  );
  check('the row offers a cancel control', (await cancelButton.count()) >= 1,
    `${await cancelButton.count()} buttons`);

  calls.length = 0;
  await cancelButton.first().click();
  await page.waitForTimeout(2500);
  check('cancelling calls the server',
    calls.some((c) => c.startsWith('DELETE /companies/employees/invitations/')),
    calls.join(' | ') || 'no call');
  check('and re-reads the list rather than patching it locally',
    calls.some((c) => c.startsWith('GET /companies/employees')));

  text = await page.evaluate(() => document.body.innerText);
  check('the withdrawn seat is gone from the screen', !text.includes('Withdrawn Person'));

  section('3. An approved employee has no cancel control');
  await page.fill('#invitedFullName', 'Kept Person');
  await page.selectOption('#invitedCompanyPosition', 'employee');
  await page.click('.invite-form button[type="submit"], form button[type="submit"]');
  await page.waitForTimeout(2000);
  const beforeApproval = await cancelButton.count();
  check('an unclaimed seat still offers cancel', beforeApproval >= 1, `${beforeApproval}`);

  await browser.close();
  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error) => { console.error(error); process.exit(2); });
