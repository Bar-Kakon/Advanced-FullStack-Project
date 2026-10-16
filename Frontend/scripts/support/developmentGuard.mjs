/**
 * Imported first by every development browser and API test, and it has no override: a script that
 * may touch production is an authorized procedure and never imports this file.
 */
import { chromium } from 'playwright';

const LOCAL_HOSTS = new Set(['127.0.0.1', 'localhost', '::1']);
const isLocalHost = (hostname) => LOCAL_HOSTS.has(hostname.replace(/^\[|\]$/g, '').toLowerCase());
const isDeployment = (hostname) => /(^|\.)(onrender\.com|vercel\.app)$/i.test(hostname);

const refuse = (reason) => {
  console.error(`REFUSED: development tests write only to this machine — ${reason}. Nothing was written.`);
  process.exit(2);
};

for (const key of ['APP_URL', 'API_URL', 'BASE_URL', 'FRONTEND_URL']) {
  const value = process.env[key];
  if (value === undefined) continue;
  let hostname = '';
  try {
    hostname = new URL(value).hostname;
  } catch {
    refuse(`${key} is not a URL`);
  }
  if (!isLocalHost(hostname)) refuse(`${key} points at ${hostname}`);
}

const originalFetch = globalThis.fetch;
const confirmed = new Map();

const confirmLocalApi = (origin) => {
  let pending = confirmed.get(origin);
  if (pending === undefined) {
    pending = (async () => {
      const reply = await originalFetch(`${origin}/api/health`).catch(() => null);
      const body = reply === null ? null : await reply.json().catch(() => null);
      if (body?.localDatabase !== true) refuse(`the API at ${origin} does not confirm a database on this machine`);
    })();
    confirmed.set(origin, pending);
  }
  return pending;
};

const check = async (url) => {
  if (isDeployment(url.hostname)) refuse(`a request was about to reach the deployment ${url.hostname}`);
  if (url.pathname.startsWith('/api/')) {
    if (!isLocalHost(url.hostname)) refuse(`a request was about to reach the API at ${url.hostname}`);
    if (url.pathname !== '/api/health') await confirmLocalApi(url.origin);
  }
};

globalThis.fetch = async (input, init) => {
  await check(new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url));
  return originalFetch(input, init);
};

const guardRoute = async (route) => {
  const url = new URL(route.request().url());
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    if (isDeployment(url.hostname) || (url.pathname.startsWith('/api/') && !isLocalHost(url.hostname))) {
      await route.abort('blockedbyclient').catch(() => {});
    }
    await check(url);
  }
  await route.continue().catch(() => {});
};

const launch = chromium.launch.bind(chromium);
chromium.launch = async (...args) => {
  const browser = await launch(...args);
  const newContext = browser.newContext.bind(browser);
  browser.newContext = async (...options) => {
    const context = await newContext(...options);
    await context.route('**/*', guardRoute);
    return context;
  };
  return browser;
};
