/**
 * Real-browser layout proof for Browse Contractors.
 *
 * Source and CSS inspection cannot show what happens while a page is scrolled, which is exactly
 * where the sticky panels collided. Every check here measures real boxes at real viewport sizes,
 * at several scroll positions, in both languages.
 *
 * Needs the API and the dev server running, and an account to sign in with:
 *
 *   BROWSE_EMAIL=someone@example.com BROWSE_PASSWORD='…' npm run verify:layout
 */
import { chromium } from 'playwright';

const APP = process.env.APP_URL ?? 'http://localhost:5173';
const EMAIL = process.env.BROWSE_EMAIL ?? 'bt-alice@example.com';
const PASSWORD = process.env.BROWSE_PASSWORD ?? 'CorrectHorse42!';

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900 },
  { name: 'laptop', width: 1300, height: 900 },
  { name: 'small-laptop', width: 1100, height: 900 },
  { name: 'narrow', width: 1000, height: 800 },
  { name: 'tablet', width: 820, height: 1180 },
  { name: 'phone', width: 390, height: 844 },
];

const SCROLL_STOPS = [0, 150, 300, 600, 900, 1400, 2000, 2600, 3400];

let failures = 0;
const check = (label, passed, detail = '') => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${String(label).padEnd(58)} ${detail}`);
};
const section = (title) => console.log(`\n${title}`);

/** Every pair of panels, measured as real boxes. A pair overlaps only on both axes at once. */
const measure = (page) => page.evaluate(() => {
  const box = (selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
  };
  const overlap = (a, b) => {
    if (!a || !b) return null;
    const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
    const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
    return x > 1 && y > 1 ? `${Math.round(x)}x${Math.round(y)}px` : null;
  };

  const rail = box('.filters');
  const advanced = box('.adv-panel');
  const results = box('.results');
  const profile = box('.profile-panel');

  return {
    scrollY: Math.round(window.scrollY),
    overlaps: Object.entries({
      'rail/advanced': overlap(rail, advanced),
      'rail/results': overlap(rail, results),
      'rail/profile': overlap(rail, profile),
      'advanced/results': overlap(advanced, results),
      'advanced/profile': overlap(advanced, profile),
      'results/profile': overlap(results, profile),
    }).filter(([, value]) => value !== null).map(([pair, value]) => `${pair} ${value}`),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    resultsTop: results ? Math.round(results.top + window.scrollY) : null,
    profileTop: profile ? Math.round(profile.top + window.scrollY) : null,
    railLeft: rail ? Math.round(rail.left) : null,
    resultsLeft: results ? Math.round(results.left) : null,
    direction: document.documentElement.dir || document.body.dir,
  };
});

const scan = async (page, label, expectProfileBelow) => {
  const collisions = [];
  let worstOverflow = 0;
  let stacked = null;

  for (const stop of SCROLL_STOPS) {
    await page.evaluate((to) => window.scrollTo(0, to), stop);
    await page.waitForTimeout(180);
    const reading = await measure(page);
    if (reading.overlaps.length > 0) collisions.push(`y=${reading.scrollY}: ${reading.overlaps.join(', ')}`);
    worstOverflow = Math.max(worstOverflow, reading.overflow);
    if (stacked === null && reading.profileTop !== null && reading.resultsTop !== null) {
      stacked = reading.profileTop >= reading.resultsTop;
    }
  }

  check(`${label} — no panel overlaps another while scrolling`,
    collisions.length === 0, collisions.slice(0, 2).join(' | '));
  check(`${label} — no horizontal overflow`, worstOverflow <= 1, `${worstOverflow}px`);
  if (expectProfileBelow && stacked !== null) {
    check(`${label} — the profile sits below the results`, stacked === true);
  }
};

const run = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  await page.goto(`${APP}/login`, { waitUntil: 'networkidle' });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(2500);
  await page.goto(`${APP}/browse`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  section('1. Advanced filters are a real column, never an overlay');
  await page.click('.adv-trigger');
  await page.waitForTimeout(500);
  const panel = await page.evaluate(() => {
    const element = document.querySelector('.adv-panel');
    const style = getComputedStyle(element);
    return {
      present: element !== null,
      position: style.position,
      width: Math.round(element.getBoundingClientRect().width),
      grid: getComputedStyle(document.querySelector('.browse__body')).gridTemplateColumns,
      groups: document.querySelectorAll('.adv-panel .adv-group').length,
    };
  });
  check('the panel opens', panel.present);
  check('it is not fixed or absolute', !['fixed', 'absolute'].includes(panel.position), panel.position);
  check('it occupies its own grid track', panel.grid.split(' ').length >= 3, panel.grid);
  check('it carries the place, distance and rating groups', panel.groups >= 3, `${panel.groups} groups`);
  check('the minimum-rating control is present',
    (await page.locator('.star-select input[name="minRating"]').count()) === 5);

  section('2. Every viewport, both languages, while scrolling');
  for (const language of ['he', 'en']) {
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.click(`.lang-switch__btn:has-text("${language === 'he' ? 'עב' : 'EN'}")`);
    await page.waitForTimeout(400);

    for (const viewport of VIEWPORTS) {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await page.waitForTimeout(350);

      if ((await page.locator('.adv-panel').count()) === 0) {
        await page.click('.adv-trigger').catch(() => {});
        await page.waitForTimeout(350);
      }
      if ((await page.locator('.profile-panel').count()) === 0) {
        await page.locator('.c-card .btn--ghost').first().click().catch(() => {});
        await page.waitForTimeout(1200);
      }

      await scan(page, `${language} ${viewport.name} ${viewport.width}px`, viewport.width <= 1180);
    }
  }

  section('3. Reading direction mirrors the columns');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(() => window.scrollTo(0, 0));
  for (const language of ['he', 'en']) {
    await page.click(`.lang-switch__btn:has-text("${language === 'he' ? 'עב' : 'EN'}")`);
    await page.waitForTimeout(500);
    const reading = await measure(page);
    check(`${language} reports the right direction`,
      reading.direction === (language === 'he' ? 'rtl' : 'ltr'), reading.direction);
    check(`${language} puts the rail on the ${language === 'he' ? 'right' : 'left'}`,
      language === 'he'
        ? reading.railLeft > reading.resultsLeft
        : reading.railLeft < reading.resultsLeft,
      `rail x=${reading.railLeft}, results x=${reading.resultsLeft}`);
  }

  await browser.close();
  console.log(`\n${failures === 0 ? 'All layout checks passed.' : `${failures} layout check(s) FAILED.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error) => { console.error(error); process.exit(2); });