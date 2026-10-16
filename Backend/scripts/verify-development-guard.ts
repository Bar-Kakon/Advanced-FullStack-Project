/**
 * Proves the development guards fail closed: real development scripts, run from a throwaway copy of
 * a checkout whose .env names a production-like cluster (fictional host, fake credentials), refuse before any
 * connection; an API that cannot confirm a local database receives nothing; authorized operations
 * stay separate; ordinary local runs still work. No real .env file is touched.
 *
 *   npm run verify:development-guard
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createHealthCheck } from '../src/routes/health.routes.js';
import { isLocalDatabaseUri } from '../src/db/localDatabase.js';

const BACKEND = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const FRONTEND = resolve(BACKEND, '..', 'Frontend');
const TSX = join(BACKEND, 'node_modules', '.bin', 'tsx');
const PRODUCTION_LIKE = 'mongodb+srv://simulated-user:not-a-real-password@production-cluster.example.invalid/test?retryWrites=true';
const REMOTE_PLAIN = 'mongodb://shard-00-00.production-cluster.example.invalid:27017/test';
const LOCAL = 'mongodb://127.0.0.1:27017/blokta-guard-check';

let failures = 0;
const temporary: string[] = [];
const check = (label: string, passed: boolean, detail?: unknown): void => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${label}${!passed && detail !== undefined ? `  ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
};
const section = (title: string): void => console.log(`\n${title}`);

const checkout = (mongoUri: string, extra: Record<string, string> = {}): string => {
  const dir = mkdtempSync(join(tmpdir(), 'blokta-guard-'));
  temporary.push(dir);
  const replaced = new Set(['MONGODB_URI', ...Object.keys(extra)]);
  const base = readFileSync(join(BACKEND, '.env'), 'utf8')
    .split('\n')
    .filter((line) => !/^\s*(SMTP_|MAIL_)/.test(line) && !replaced.has(line.split('=')[0]?.trim() ?? ''));
  const env = [...base, `MONGODB_URI=${mongoUri}`, ...Object.entries(extra).map(([k, v]) => `${k}=${v}`)];
  writeFileSync(join(dir, '.env'), `${env.join('\n')}\n`, { mode: 0o600 });
  return dir;
};

const childEnv = (overrides: Record<string, string> = {}): NodeJS.ProcessEnv => {
  const env: NodeJS.ProcessEnv = { ...process.env, ...overrides };
  for (const key of ['MONGODB_URI', 'API_URL', 'BASE_URL', 'APP_URL']) if (!(key in overrides)) delete env[key];
  return env;
};

const run = (command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv = childEnv()) =>
  new Promise<{ code: number | null; out: string; seconds: number }>((done) => {
    const started = Date.now();
    const child = spawn(command, args, { cwd, env });
    let out = '';
    child.stdout.on('data', (chunk: Buffer) => { out += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { out += chunk.toString(); });
    const timer = setTimeout(() => child.kill('SIGKILL'), 180_000);
    child.on('close', (code) => {
      clearTimeout(timer);
      done({ code, out, seconds: (Date.now() - started) / 1000 });
    });
  });

const refusedFast = (r: { code: number | null; out: string; seconds: number }) =>
  r.code === 2 && r.out.includes('REFUSED') && r.seconds < 30;

const fakeApi = async (confirmsLocal: boolean) => {
  const hits: string[] = [];
  const server: Server = createServer((req, res) => {
    hits.push(`${req.method} ${req.url}`);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.end(JSON.stringify(req.url === '/api/health'
      ? { status: 'ok', database: 'connected', ...(confirmsLocal ? { localDatabase: true } : {}) }
      : { ok: true }));
  });
  await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`, hits, close: () => server.close() };
};

const main = async (): Promise<void> => {
  section('1. The local-database rule');
  const allowed = [
    'mongodb://127.0.0.1:27017/x', 'mongodb://localhost/x', 'mongodb://[::1]:27017/x',
    'mongodb://user:pw@127.0.0.1:27017/x?authSource=admin', 'mongodb://127.0.0.1:27017,localhost:27018/x?replicaSet=r',
  ];
  const refused = [
    PRODUCTION_LIKE, REMOTE_PLAIN, 'mongodb+srv://localhost/x', 'mongodb://127.0.0.1:27017,db.example.net:27017/x',
    'mongodb://localhost@db.example.net/x', 'mongodb://127.0.0.1.db.example.net/x', '', 'not a uri',
  ];
  check('every local form is accepted', allowed.every(isLocalDatabaseUri), allowed.filter((u) => !isLocalDatabaseUri(u)));
  check('SRV, remote, mixed, disguised, empty and unreadable targets are all refused',
    refused.every((u) => !isLocalDatabaseUri(u)), refused.filter(isLocalDatabaseUri));
  const shown: Record<string, unknown>[] = [];
  const res = { json: (body: Record<string, unknown>) => shown.push(body) } as never;
  createHealthCheck(true)({} as never, res);
  createHealthCheck(false)({} as never, res);
  check('the health route confirms a local database only when it has one', shown[0]?.['localDatabase'] === true && !('localDatabase' in (shown[1] ?? {})));

  section('2. A checkout whose .env names production — every kind of development script refuses before connecting');
  const prodCheckout = checkout(PRODUCTION_LIKE);
  const remoteCheckout = checkout(REMOTE_PLAIN);
  const scripts: Array<[string, string]> = [
    ['verify-task-detail.ts', 'harness test'],
    ['verify-delegation-wall.ts', 'harness test that redirects to a scratch database'],
    ['verify-employee-lifecycle.ts', 'direct-connection test that also drives an API'],
    ['seed-my-tasks.ts', 'fixture seeder'],
    ['seed-min-rating.ts', 'fixture seeder through the harness'],
  ];
  for (const [file, kind] of scripts) {
    const srv = await run(TSX, [join(BACKEND, 'scripts', file)], prodCheckout);
    check(`${file} (${kind}) refuses a production-like SRV cluster`, refusedFast(srv), { code: srv.code, out: srv.out.slice(-200) });
    const plain = await run(TSX, [join(BACKEND, 'scripts', file)], remoteCheckout);
    check(`${file} refuses a plain remote host too`, refusedFast(plain), { code: plain.code });
  }
  const viaEnv = await run(TSX, [join(BACKEND, 'scripts', 'verify-task-detail.ts')], checkout(LOCAL), childEnv({ MONGODB_URI: PRODUCTION_LIKE }));
  check('an exported MONGODB_URI naming production is refused even when .env is local', refusedFast(viaEnv), { code: viaEnv.code });
  const apiProd = await run(TSX, [join(BACKEND, 'scripts', 'verify-employee-lifecycle.ts')], checkout(LOCAL), childEnv({ API_URL: 'https://blokta.onrender.com/api' }));
  check('API_URL naming the production API is refused before any request', refusedFast(apiProd), { code: apiProd.code });

  section('3. A local API that cannot confirm a local database (one started from a production checkout) receives nothing');
  const unconfirmed = await fakeApi(false);
  const crossed = await run(TSX, [join(BACKEND, 'scripts', 'verify-employee-lifecycle.ts')], checkout(LOCAL), childEnv({ API_URL: unconfirmed.url }));
  check('the test refuses at the handshake', refusedFast(crossed) && crossed.out.includes('does not confirm'), crossed.out.slice(-200));
  check('the API received the health question and nothing else', unconfirmed.hits.every((hit) => hit === 'GET /api/health') && unconfirmed.hits.length >= 1, unconfirmed.hits);
  unconfirmed.close();

  section('4. Frontend development tests');
  const frontendRun = (script: string, env: Record<string, string>) => run('node', [join(FRONTEND, 'scripts', script)], FRONTEND, childEnv(env));
  const appProd = await frontendRun('verify-landing-ui.mjs', { APP_URL: 'https://blokta.vercel.app' });
  check('APP_URL naming the production site is refused before a browser opens', refusedFast(appProd), { code: appProd.code });
  const feApiProd = await frontendRun('verify-404-ui.mjs', { API_URL: 'https://blokta.onrender.com/api' });
  check('API_URL naming the production API is refused', refusedFast(feApiProd), { code: feApiProd.code });

  const page = createServer((req, res) => {
    res.setHeader('Content-Type', 'text/html');
    res.end(`<!doctype html><title>x</title><script>
      const q = new URLSearchParams(location.search);
      fetch(q.get('target'), { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'probe' }).catch(() => {});
    </script>`);
  });
  await new Promise<void>((done) => page.listen(0, '127.0.0.1', done));
  const pageUrl = `http://127.0.0.1:${(page.address() as AddressInfo).port}/`;
  const probeDir = mkdtempSync(join(tmpdir(), 'blokta-guard-probe-'));
  temporary.push(probeDir);
  const probe = join(FRONTEND, 'scripts', 'support', `.guard-probe-${process.pid}.mjs`);
  writeFileSync(probe, `import './developmentGuard.mjs';
import { chromium } from 'playwright';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(process.argv[2]);
await page.waitForTimeout(4000);
await browser.close();
console.log('NOT BLOCKED');
`);
  const unconfirmedForBrowser = await fakeApi(false);
  const toUnconfirmed = await run('node', [probe, `${pageUrl}?target=${encodeURIComponent(`${unconfirmedForBrowser.url}/auth/register`)}`], probeDir, childEnv());
  check('an app calling a local API that cannot confirm a local database is stopped in the browser', refusedFast(toUnconfirmed) && !toUnconfirmed.out.includes('NOT BLOCKED'), toUnconfirmed.out.slice(-200));
  check('that API received no write', unconfirmedForBrowser.hits.every((hit) => hit === 'GET /api/health'), unconfirmedForBrowser.hits);
  unconfirmedForBrowser.close();
  const toProduction = await run('node', [probe, `${pageUrl}?target=${encodeURIComponent('https://blokta.onrender.com/api/auth/register')}`], probeDir, childEnv());
  check('an app built to call the production API is stopped in the browser before the request leaves', refusedFast(toProduction) && !toProduction.out.includes('NOT BLOCKED'), toProduction.out.slice(-200));
  const confirmedApi = await fakeApi(true);
  const toLocal = await run('node', [probe, `${pageUrl}?target=${encodeURIComponent(`${confirmedApi.url}/auth/register`)}`], probeDir, childEnv());
  check('an app calling a local API that confirms its local database is let through', toLocal.code === 0 && toLocal.out.includes('NOT BLOCKED') && confirmedApi.hits.includes('POST /api/auth/register'), { code: toLocal.code, hits: confirmedApi.hits });
  confirmedApi.close();
  page.close();
  rmSync(probe, { force: true });

  section('5. Authorized operations stay separate from development tests');
  const op = await run(TSX, [join(BACKEND, 'scripts', 'migrate-original-dates.ts')], checkout('mongodb+srv://simulated:x@cluster.example.invalid/test'));
  check('an authorized operation is not blocked by the development guard (it tries to connect, and fails only on the fake host)', op.code !== 2 && !op.out.includes('REFUSED: development tests'), op.out.slice(-200));

  section('6. Every development script carries the guard first; authorized ones never do');
  const authorizedBackend = new Set([
    'anonymize-accounts.ts', 'billing-sweep.ts', 'grant-platform-admin.ts', 'provision-paypal-plans.ts', 'seed-plans.ts', 'verify-development-guard.ts',
  ]);
  const backendFiles = readdirSync(join(BACKEND, 'scripts')).filter((f) => f.endsWith('.ts'));
  const firstImport = (src: string) => /^import\s+[^;]*;/m.exec(src)?.[0] ?? '';
  const backendDev = backendFiles.filter((f) => (f.startsWith('verify-') || f.startsWith('seed-')) && !authorizedBackend.has(f));
  const backendMissing = backendDev.filter((f) => firstImport(readFileSync(join(BACKEND, 'scripts', f), 'utf8')) !== "import './support/developmentGuard.js';");
  check(`all ${backendDev.length} backend development scripts import the guard first`, backendMissing.length === 0, backendMissing);
  const backendOps = backendFiles.filter((f) => f.startsWith('migrate-') || authorizedBackend.has(f));
  const opsWithGuard = backendOps.filter((f) => f !== 'verify-development-guard.ts' && readFileSync(join(BACKEND, 'scripts', f), 'utf8').includes('developmentGuard'));
  check(`none of the ${backendOps.length - 1} authorized backend operations imports it`, opsWithGuard.length === 0, opsWithGuard);
  const authorizedFrontend = new Set(['verify-standalone-dates-cloud.mjs', 'gsi-probe.mjs']);
  const frontendFiles = readdirSync(join(FRONTEND, 'scripts')).filter((f) => f.endsWith('.mjs'));
  const frontendMissing = frontendFiles.filter((f) => !authorizedFrontend.has(f))
    .filter((f) => firstImport(readFileSync(join(FRONTEND, 'scripts', f), 'utf8')) !== "import './support/developmentGuard.mjs';");
  check(`all ${frontendFiles.length - authorizedFrontend.size} frontend development scripts import the guard first`, frontendMissing.length === 0, frontendMissing);
  check('the authorized production procedure does not', !readFileSync(join(FRONTEND, 'scripts', 'verify-standalone-dates-cloud.mjs'), 'utf8').includes('developmentGuard'));

  section('7. Ordinary local runs still work');
  const localRun = await run(TSX, [join(BACKEND, 'scripts', 'verify-task-detail.ts')], checkout(LOCAL));
  check('a full harness test passes against a local database', localRun.code === 0 && localRun.out.includes('All checks passed'), localRun.out.slice(-200));
  const apiDir = checkout(LOCAL, { PORT: '4848', CORS_ORIGINS: 'http://localhost:5848', FRONTEND_URL: 'http://localhost:5848' });
  const server = spawn(TSX, [join(BACKEND, 'src', 'server.ts')], { cwd: apiDir, env: childEnv(), stdio: 'ignore' });
  let up = false;
  for (let i = 0; i < 40 && !up; i += 1) {
    up = await fetch('http://127.0.0.1:4848/api/health').then((r) => r.ok).catch(() => false);
    if (!up) await new Promise((r) => setTimeout(r, 1000));
  }
  const health = await fetch('http://127.0.0.1:4848/api/health').then((r) => r.json()).catch(() => null) as { localDatabase?: boolean } | null;
  check('a local API started from a local checkout confirms its local database', health?.localDatabase === true, health);
  const direct = await run(TSX, [join(BACKEND, 'scripts', 'verify-employee-lifecycle.ts')], checkout(LOCAL), childEnv({ API_URL: 'http://127.0.0.1:4848/api' }));
  check('a direct-connection test driving that API passes', direct.code === 0, direct.out.slice(-300));
  server.kill();

  for (const dir of temporary) rmSync(dir, { recursive: true, force: true });
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
