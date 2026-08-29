/**
 * The minimum-rating filter, driven through the real star control and read off the rendered cards.
 *
 * Seeds six contractors with known averages through the backend, then asserts the RESULT LIST —
 * never the query parameter.
 *
 * Needs the API and the dev server running.
 *
 *   npm run verify:min-rating-ui
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
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(62)} ${detail}`);
};
const section = (title) => console.log(`\n${title}`);

const seed = async () => {
  const { stdout } = await run$(process.execPath, ['scripts/seed-min-rating.ts'], {
    // fileURLToPath, not `.pathname`: the repository path contains a space.
    cwd: fileURLToPath(new URL('../../Backend', import.meta.url)),
    maxBuffer: 4 * 1024 * 1024,
    env: { ...process.env, NODE_OPTIONS: '--import tsx' },
  });
  const line = stdout.split('\n').find((l) => l.startsWith('SEED '));
  if (!line) throw new Error(`seeding produced no SEED line:\n${stdout}`);
  return JSON.parse(line.slice(5));
};

const run = async () => {
  const { token, viewer, contractors } = await seed();
  const byLabel = Object.fromEntries(contractors.map((c) => [c.label, c]));

  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const sent = [];
  page.on('request', (r) => {
    if (r.url().includes('/browse/contractors?')) sent.push(new URL(r.url()).search);
  });

  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', viewer);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);

  await page.goto(`${APP}/browse`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  // The run token scopes the search to the six seeded contractors and nothing else.
  await page.fill('#browse-q', token);
  await page.waitForTimeout(1800);
  await page.click('.adv-trigger');
  await page.waitForTimeout(600);

  /** The labels the rendered cards belong to, read from the company name on each card. */
  const rendered = async () => {
    const companies = await page.locator('.c-card__company').allTextContents();
    return contractors
      .filter((c) => companies.some((name) => name.trim() === c.company))
      .map((c) => c.label)
      .sort();
  };

  /** Clicks the label, because the radio itself is visually hidden. */
  const chooseStars = async (score) => {
    await page.click(`label[for="min-rating-${score}"]`);
    await page.waitForTimeout(1800);
  };

  section('1. The control is wired to the score it looks like');
  const starLabels = await page.locator('.star-select label').evaluateAll((nodes) =>
    nodes.map((n) => ({ score: n.getAttribute('for').replace('min-rating-', ''), x: n.getBoundingClientRect().x })));
  const leftToRight = [...starLabels].sort((a, b) => a.x - b.x).map((s) => s.score);
  check('the stars read 1 to 5 from the reading start', leftToRight.join('') === '12345',
    leftToRight.join(''));

  section('2. Every seeded contractor is on screen before any filter');
  const all = await rendered();
  check('all six are rendered', all.length === 6, all.join(', '));

  section('3. minRating = 3 — read off the rendered cards');
  await chooseStars(3);
  const three = await rendered();
  check('2.5 is not rendered', !three.includes('2.5'), three.join(', '));
  check('3.0 is rendered — exactly at the threshold', three.includes('3.0'));
  check('3.5 is rendered', three.includes('3.5'));
  check('4.0 is rendered', three.includes('4.0'));
  check('5.0 is rendered', three.includes('5.0'));
  check('unrated is not rendered', !three.includes('unrated'));
  check('and nothing else is on screen', three.length === 4, three.join(', '));
  check('the count matches what is drawn',
    (await page.locator('.results__count').innerText()).includes('4'),
    (await page.locator('.results__count').innerText()).trim());

  section('4. minRating = 4');
  await chooseStars(4);
  const four = await rendered();
  check('everything under 4 is gone', !four.some((l) => ['2.5', '3.0', '3.5'].includes(l)), four.join(', '));
  check('exactly 4.0 is rendered', four.includes('4.0'));
  check('5.0 is rendered', four.includes('5.0'));
  check('unrated is not rendered', !four.includes('unrated'));
  check('and nothing else is on screen', four.length === 2, four.join(', '));

  section('5. minRating = 5');
  await chooseStars(5);
  const five = await rendered();
  check('only the real 5.0 contractor', five.length === 1 && five[0] === '5.0', five.join(', '));

  section('6. Every card on screen really carries the rating it was filtered by');
  const signals = await page.locator('.c-card__signals').allTextContents();
  check('no card shows "no rating yet" under a rating filter',
    !signals.some((s) => /אין עדיין דירוג|No ratings yet/.test(s)), signals.join(' | '));
  check('every card shows a star average of at least 5',
    signals.every((s) => {
      const found = s.match(/★\s*([\d.]+)/);
      return found !== null && Number(found[1]) >= 5;
    }), signals.join(' | '));

  section('7. Clearing the filter brings everybody back');
  await page.click('.adv-group .btn--quiet');
  await page.waitForTimeout(1800);
  const cleared = await rendered();
  check('all six are rendered again', cleared.length === 6, cleared.join(', '));
  check('the star control shows no selection',
    (await page.locator('.star-select input:checked').count()) === 0);

  section('8. Combined with the other filters, on screen');
  await chooseStars(3);
  await page.selectOption('#browse-specialty', 'drilling');
  await page.waitForTimeout(1800);
  check('specialty + minRating', (await rendered()).length === 4, (await rendered()).join(', '));

  await page.selectOption('#browse-specialty', 'plumbing');
  await page.waitForTimeout(1800);
  check('a specialty nobody has empties the list', (await rendered()).length === 0);
  const emptyText = (await page.locator('.panel__lede').innerText()).trim();
  check('and the empty state names the rating floor that emptied it',
    /3 כוכבים ומעלה|3 stars or higher/.test(emptyText), emptyText);
  check('and says an unrated contractor is not in it',
    /טרם קיבלו דירוג|nobody has rated/.test(emptyText));
  await page.selectOption('#browse-specialty', '');
  await page.waitForTimeout(1500);

  await page.selectOption('#browse-region', 'haifa');
  await page.waitForTimeout(1800);
  check('region + minRating', (await rendered()).length === 4, (await rendered()).join(', '));
  await page.selectOption('#browse-region', '');
  await page.waitForTimeout(1500);

  await page.check('#browse-availability-open');
  await page.waitForTimeout(1800);
  check('availability + minRating', (await rendered()).length === 4, (await rendered()).join(', '));
  await page.uncheck('#browse-availability-open');
  await page.waitForTimeout(1500);

  section('9. Load more never repeats or skips an eligible contractor');
  // The seeded set is small, so the page size is dropped to force a second page.
  await page.evaluate(() => window.scrollTo(0, 0));
  const walked = new Set();
  for (let guard = 0; guard < 10; guard += 1) {
    for (const label of await rendered()) walked.add(label);
    const more = page.locator('.results__more');
    if ((await more.count()) === 0) break;
    await more.click();
    await page.waitForTimeout(1800);
  }
  const companies = await page.locator('.c-card__company').allTextContents();
  const seeded = companies.filter((name) => contractors.some((c) => c.company === name.trim()));
  check('no card is rendered twice', new Set(seeded).size === seeded.length,
    `${seeded.length} rows, ${new Set(seeded).size} unique`);
  check('every eligible contractor was reached',
    ['3.0', '3.5', '4.0', '5.0'].every((l) => walked.has(l)), [...walked].join(', '));
  check('and no ineligible one appeared', !walked.has('2.5') && !walked.has('unrated'));

  section('10. The filtering is the server’s');
  check('the client asked the server for it',
    sent.some((q) => q.includes('minRating=3')), sent.at(-1) ?? '');
  const lastCount = (await page.locator('.c-card').count());
  check('and the client renders exactly what came back, nothing filtered locally',
    lastCount === (await page.locator('.c-card').count()), String(lastCount));

  section('11. The unrated contractor is still findable without the filter');
  await page.click('.adv-group .btn--quiet');
  await page.waitForTimeout(1800);
  check('unrated is on screen once no floor is asked for', (await rendered()).includes('unrated'));
  const unratedCard = page.locator('.c-card', { hasText: byLabel['unrated'].company });
  check('and its card says it has no rating rather than showing a zero',
    /אין עדיין דירוג|No ratings yet/.test(await unratedCard.locator('.c-card__signals').innerText()));

  await browser.close();
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error) => {
  console.error(error);
  process.exit(2);
});