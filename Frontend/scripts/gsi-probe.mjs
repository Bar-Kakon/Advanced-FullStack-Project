import { chromium } from 'playwright';

const SCRATCH = '/private/tmp/claude-501/-Users-barrebeccakakon-Desktop-Advanced-FullStack-Project/5f6ee8a2-364c-4187-bfbb-036b493ff4c6/scratchpad';
const browser = await chromium.launch();
const page = await browser.newPage();
const consoleLines = [];
const gsiRequests = [];
page.on('console', (m) => consoleLines.push(`[${m.type()}] ${m.text()}`));
page.on('response', (r) => {
  if (r.url().includes('accounts.google.com')) gsiRequests.push(`${r.status()} ${r.url().slice(0, 140)}`);
});
await page.goto('https://blokta.vercel.app/login', { waitUntil: 'networkidle', timeout: 60000 });
await page.waitForTimeout(6000);
const iframeCount = await page.locator('iframe[src*="accounts.google.com"]').count();
const gsiHost = await page.locator('.g_id_signin, [id*="google"], div[class*="google"]').count();
await page.screenshot({ path: `${SCRATCH}/gl-prod-login.png`, fullPage: true });
console.log('--- GSI iframes rendered:', iframeCount, '| google-ish containers:', gsiHost);
console.log('--- accounts.google.com responses ---');
for (const r of gsiRequests) console.log(' ', r.replaceAll(/client_id=[^&]+/g, 'client_id=<redacted>'));
console.log('--- console messages ---');
for (const l of consoleLines) console.log(' ', l.replaceAll(/[\w-]+\.apps\.googleusercontent\.com/g, '<client-id>'));
await browser.close();
