/**
 * The report flow and the moderation surfaces, driven through the real browser.
 *
 * It proves the reporter can file from the public profile in both languages, that the neutral
 * acknowledgement is what comes back, that no enum code is ever rendered, that an ordinary account
 * cannot reach the moderation area, and that a moderator can read and resolve a report.
 *
 * Needs the API and the dev server running.
 *
 *   npm run verify:moderation-ui
 */
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const PASSWORD = 'CorrectHorse42!';
const run$ = promisify(execFile);

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(64)} ${detail}`);
};
const section = (title) => console.log(`\n${title}`);

const seed = async () => {
  const { stdout } = await run$(process.execPath, ['scripts/seed-moderation.ts'], {
    // fileURLToPath, not `.pathname`: the repository path contains a space.
    cwd: fileURLToPath(new URL('../../Backend', import.meta.url)),
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: '--import tsx' },
  });
  const line = stdout.split('\n').find((l) => l.startsWith('SEED '));
  if (!line) throw new Error(`seeding produced no SEED line:\n${stdout}`);
  return JSON.parse(line.slice(5));
};

/** The four storage codes. None of them may ever appear in rendered text. */
const CODES = ['spam', 'harassment', 'impersonation', 'other'];
const STATE_CODES = ['under_review', 'report.submitted', 'report.dismissed', 'account.restricted'];

const run = async () => {
  const { reporter, subject, subjectUserId, moderator, searchTerm } = await seed();

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const signIn = async (email) => {
    await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
    await page.fill('#email', email);
    await page.fill('#password', PASSWORD);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(2500);
  };

  const setLang = async (lang) => {
    await page.click(`.lang-switch__btn:has-text("${lang === 'he' ? 'עב' : 'EN'}")`);
    await page.waitForTimeout(500);
  };

  const openSubjectProfile = async () => {
    await page.goto(`${APP}/browse`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.fill('#browse-q', searchTerm);
    await page.waitForTimeout(1800);
    // The card's own View button opens the panel; the article itself is not the control.
    await page.locator('.c-card__actions .btn--ghost').first().click();
    await page.waitForTimeout(1800);
  };

  /* ── 1. The reporter files from the public profile, in Hebrew ──────────────────────────── */
  section('1. The report entry point sits on the public profile');
  await signIn(reporter);
  await setLang('he');
  await openSubjectProfile();

  const trigger = page.locator('.pp-report');
  check('the profile carries a Report control', (await trigger.count()) === 1);
  check('and it is worded, not coded', (await trigger.innerText()).trim() === 'דיווח');

  await trigger.click();
  await page.waitForTimeout(400);

  section('2. The form offers worded reasons, never enum codes');
  const options = await page.locator('#report-reason option').allTextContents();
  check('four reasons plus the placeholder are offered', options.length === 5, options.length);
  check(
    'no storage code is rendered as a label',
    !options.some((label) => CODES.includes(label.trim())),
    options.join(' | '),
  );
  check(
    'the Hebrew labels are the ones shown',
    options.some((label) => label.includes('הטרדה')),
    options.join(' | '),
  );

  section('3. Submitting returns a neutral acknowledgement and nothing else');
  await page.selectOption('#report-reason', 'harassment');
  await page.fill('#report-note', 'בדיקת ממשק — הסבר של המדווח');
  await page.click('.report-dialog button[type="submit"]');
  // Waits for the acknowledgement itself rather than for a duration, so a slow response is not
  // read as a failed submission.
  await page.locator('#report-done-title').waitFor({ timeout: 15000 }).catch(() => {});

  const done = page.locator('.report-dialog');
  const doneText = await done.innerText();
  check('the acknowledgement is shown', doneText.includes('תודה'), doneText.slice(0, 80));
  check('it names no status', !/פתוח|בבדיקה|נדחה|טופל/.test(doneText));
  check('it promises no outcome', !/יחסם|יושעה|תוך|ימים/.test(doneText));
  check('and it says the outcome is not disclosed', doneText.includes('אינה נמסרת'));

  section('4. The same flow works in English');
  await page.locator('.report-dialog button').first().click();
  await page.waitForTimeout(400);
  await setLang('en');
  await openSubjectProfile();

  const enTrigger = page.locator('.pp-report');
  check('the control is translated', (await enTrigger.innerText()).trim() === 'Report');
  await enTrigger.click();
  await page.waitForTimeout(400);

  const enOptions = await page.locator('#report-reason option').allTextContents();
  check(
    'the English labels are complete and carry no code',
    enOptions.some((l) => l.includes('Impersonation')) &&
      !enOptions.some((l) => CODES.includes(l.trim())),
    enOptions.join(' | '),
  );

  section('5. The duplicate rule is worded, not a raw error');
  await page.selectOption('#report-reason', 'harassment');
  await page.click('.report-dialog button[type="submit"]');
  await page.locator('.report-dialog__error').waitFor({ timeout: 15000 }).catch(() => {});
  const dupText = await page.locator('.report-dialog').innerText();
  check(
    'the second identical report is explained in words',
    dupText.includes('already have an open report'),
    dupText.slice(0, 120),
  );
  check('no error code is rendered', !dupText.includes('DUPLICATE_OPEN_REPORT'), dupText.slice(0, 120));

  section('6. Nothing on the profile says the person has been reported');
  const panelText = await page.locator('.profile-panel').innerText();
  check('no report count is shown', !/\breported\b|\breports\b/i.test(panelText));

  section('7. An ordinary account cannot reach the moderation area');
  check('the navbar shows no moderation link', (await page.locator('.app-nav__link:has-text("Moderation")').count()) === 0);

  await page.goto(`${APP}/admin/reports`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  check('the queue address answers not-found', (await page.locator('.error-code, .err__code').count()) > 0
    || (await page.content()).includes('404'));
  check('and no queue is rendered', (await page.locator('.mod-queue').count()) === 0);

  await page.goto(`${APP}/admin/reports/${subjectUserId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  check('nor is a report detail', (await page.locator('.mod-detail').count()) === 0);

  /* ── 8. The moderator ──────────────────────────────────────────────────────────────────── */
  section('8. A platform moderator reads the queue');
  await signIn(moderator);
  await setLang('he');

  await page.goto(`${APP}/admin/reports`, { waitUntil: 'networkidle' });
  await page.locator('.mod-queue, .mod-empty').first().waitFor({ timeout: 15000 }).catch(() => {});

  check(
    'the navbar carries the moderation link',
    (await page.locator('.app-nav__link:has-text("מודרציה")').count()) === 1,
  );

  const rows = page.locator('.mod-row');
  check('the queue lists the open report', (await rows.count()) >= 1, await rows.count());

  const queueText = await page.locator('.mod-queue').innerText();
  check('the reason is worded', queueText.includes('הטרדה'), queueText.slice(0, 120));
  check(
    'no storage code appears in the queue',
    !CODES.some((code) => queueText.includes(code)) && !STATE_CODES.some((c) => queueText.includes(c)),
    queueText.slice(0, 160),
  );

  section('9. The status is carried in text, not only in colour');
  const pill = page.locator('.mod-pill').first();
  check('the state is written out', (await pill.innerText()).trim() === 'פתוח', await pill.innerText());

  section('10. The detail carries what review needs and marks the count as a signal');
  await page.locator('.mod-row .btn').first().click();
  await page.waitForTimeout(1500);

  const detail = await page.locator('.mod-detail').innerText();
  check('the reporter explanation is shown', detail.includes('הסבר של המדווח'), detail.slice(0, 200));
  check('the moderation history is shown', detail.includes('היסטוריית הטיפול'));
  check('the history is worded', detail.includes('הדיווח נשלח'));
  check('the report count is marked as a signal', detail.includes('ולא הוכחה'));
  check(
    'the closure sentence is previewed to the moderator',
    detail.includes('הדיווח נבדק ונסגר'),
  );
  check(
    'and the preview says delivery is not built',
    detail.includes('שטרם נבנתה'),
  );
  check(
    'no storage code is rendered anywhere on the detail',
    !STATE_CODES.some((code) => detail.includes(code)),
    detail.slice(0, 200),
  );

  section('11. Resolving keeps the record and shows it resolved');
  await page.fill('#mod-note', 'הערה פנימית מהבדיקה');
  await page.locator('.mod-actions button:has-text("דחיית הדיווח")').click();
  await page.waitForTimeout(1600);

  const resolvedText = await page.locator('.mod-detail').innerText();
  check('the report reads as dismissed', resolvedText.includes('נדחה'), resolvedText.slice(0, 120));
  check('the record is kept', resolvedText.includes('הרשומה וההיסטוריה נשמרות'));
  check('the history still lists the submission', resolvedText.includes('הדיווח נשלח'));
  check('and now also the dismissal', resolvedText.includes('הדיווח נדחה'));

  section('12. The moderation surface is complete in English too');
  await setLang('en');
  await page.waitForTimeout(600);
  const enDetail = await page.locator('.mod-detail').innerText();
  check('the detail is translated', enDetail.includes('Moderation history'), enDetail.slice(0, 120));
  check('the state is worded in English', enDetail.includes('Dismissed'));
  check(
    'and no storage code leaks in English either',
    !STATE_CODES.some((code) => enDetail.includes(code)),
    enDetail.slice(0, 160),
  );

  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error(error);
  process.exit(1);
});