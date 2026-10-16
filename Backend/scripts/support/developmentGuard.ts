/**
 * Imported first by every development test and fixture script, and it has no override: a script
 * that may touch production is an authorized operation and never imports this file.
 */
import { config as loadEnvFile } from 'dotenv';

import { describeDatabaseTarget, isLocalDatabaseUri, isLocalHost } from '../../src/db/localDatabase.js';

const refuse = (reason: string): never => {
  console.error(`REFUSED: development tests write only to this machine — ${reason}. Nothing was written.`);
  process.exit(2);
};

const isDeployment = (hostname: string): boolean => /(^|\.)(onrender\.com|vercel\.app)$/i.test(hostname);

loadEnvFile({ quiet: true });

const uri = process.env['MONGODB_URI'] ?? '';
if (!isLocalDatabaseUri(uri)) refuse(`MONGODB_URI points at ${describeDatabaseTarget(uri)}`);

for (const key of ['API_URL', 'BASE_URL']) {
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
const confirmed = new Map<string, Promise<void>>();

const confirmLocalApi = (origin: string): Promise<void> => {
  let pending = confirmed.get(origin);
  if (pending === undefined) {
    pending = (async () => {
      const reply = await originalFetch(`${origin}/api/health`).catch(() => null);
      const body = (reply === null ? null : await reply.json().catch(() => null)) as { localDatabase?: unknown } | null;
      if (body?.localDatabase !== true) refuse(`the API at ${origin} does not confirm a database on this machine`);
    })();
    confirmed.set(origin, pending);
  }
  return pending;
};

globalThis.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  if (isDeployment(url.hostname)) refuse(`a request was about to reach the deployment ${url.hostname}`);
  if (url.pathname.startsWith('/api/')) {
    if (!isLocalHost(url.hostname)) refuse(`a request was about to reach the API at ${url.hostname}`);
    if (url.pathname !== '/api/health') await confirmLocalApi(url.origin);
  }
  return originalFetch(input, init);
};

export const assertConnectedLocally = (connectedHost: string, connectedUri: string): void => {
  if (!isLocalDatabaseUri(connectedUri)) refuse(`the database URI points at ${describeDatabaseTarget(connectedUri)}`);
  if (!isLocalHost(connectedHost)) refuse(`the live connection reached ${connectedHost}`);
};
