import { chromium } from 'playwright';
const browser = await chromium.launch();
for (const origin of ['http://localhost:5173']) {
  const page = await browser.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.text().includes('GSI')) errs.push(m.text()); });
  await page.goto(`${origin}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(5000);
  const bad = errs.some((e) => e.includes('not allowed'));
  console.log(origin, bad ? 'NOT AUTHORIZED' : 'authorized (no GSI origin complaint)');
  await page.close();
}
await browser.close();
