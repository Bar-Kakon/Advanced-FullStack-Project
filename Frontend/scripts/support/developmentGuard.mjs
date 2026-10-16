/**
 * Imported first by every development browser and API test, and it has no override: a script that
 * may touch production is an authorized procedure and never imports this file.
 */
import { chromium, firefox, request, webkit } from 'playwright';

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

const guardApiClient = (client) => {
  for (const method of ['fetch', 'get', 'post', 'put', 'patch', 'delete', 'head']) {
    const send = client[method].bind(client);
    client[method] = async (target, ...rest) => {
      const href = typeof target === 'string' ? target : target.url();
      let url;
      try {
        url = new URL(href);
      } catch {
        refuse(`the API-client request ${href} has no absolute URL to check`);
      }
      await check(url);
      return send(target, ...rest);
    };
  }
  return client;
};

const guardContext = async (context) => {
  await context.route('**/*', guardRoute);
  guardApiClient(context.request);
  return context;
};

for (const browserType of [chromium, firefox, webkit]) {
  const launch = browserType.launch.bind(browserType);
  browserType.launch = async (...args) => {
    const browser = await launch(...args);
    const newContext = browser.newContext.bind(browser);
    browser.newContext = async (...options) => guardContext(await newContext(...options));
    return browser;
  };
  const launchPersistentContext = browserType.launchPersistentContext.bind(browserType);
  browserType.launchPersistentContext = async (...args) => guardContext(await launchPersistentContext(...args));
  browserType.connect = browserType.connectOverCDP = async () => refuse('a browser this guard did not launch cannot be checked');
}

const newRequestContext = request.newContext.bind(request);
request.newContext = async (...options) => guardApiClient(await newRequestContext(...options));
