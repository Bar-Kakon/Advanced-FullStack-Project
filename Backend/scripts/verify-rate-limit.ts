/**
 * Proves the auth rate limiters exist, fire, and answer through the project's own error contract.
 *
 * It spends the whole budget of every limiter it touches, so it needs a FRESHLY STARTED server:
 * the counters live in memory and reset when the process does.
 *
 * Start the API (`npm run dev`), then: `npm run verify:rate-limit`.
 */
import { AUTH_RATE_LIMITS } from '../src/middleware/rateLimit.js';

const API = 'http://localhost:3000/api';

let failures = 0;
const check = (label: string, passed: boolean, detail = ''): void => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${label.padEnd(66)} ${detail}`);
};

interface Reply {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly headers: Headers;
}

const post = async (path: string, payload: unknown): Promise<Reply> => {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
    headers: response.headers,
  };
};

/** Sends until the limiter answers, and reports how many got through first. */
const spend = async (path: string, payload: unknown, budget: number): Promise<{ allowed: number; blocked: Reply | null }> => {
  let allowed = 0;
  for (let attempt = 0; attempt < budget + 2; attempt += 1) {
    const reply = await post(path, payload);
    if (reply.status === 429) return { allowed, blocked: reply };
    allowed += 1;
  }
  return { allowed, blocked: null };
};

const run = async (): Promise<void> => {
  console.log('\nConfigured limits');
  for (const [name, { windowMs, limit }] of Object.entries(AUTH_RATE_LIMITS)) {
    console.log(`  ${name.padEnd(16)} ${limit} requests / ${windowMs / 60000} minutes`);
  }

  console.log('\nLOGIN — wrong credentials must not be free to retry forever');
  const login = await spend('/auth/login', { email: 'limiter@example.com', password: 'WrongPassword99!' }, AUTH_RATE_LIMITS.login.limit);
  check('the limiter fires', login.blocked !== null);
  check('it allows exactly the configured budget first', login.allowed === AUTH_RATE_LIMITS.login.limit,
    `${login.allowed} allowed, limit ${AUTH_RATE_LIMITS.login.limit}`);
  check('it answers 429', login.blocked?.status === 429, String(login.blocked?.status));
  check('through the project error contract: { code, message }',
    login.blocked?.body['code'] === 'TOO_MANY_REQUESTS' && typeof login.blocked?.body['message'] === 'string',
    JSON.stringify(login.blocked?.body));
  check('no other key leaks into the body', Object.keys(login.blocked?.body ?? {}).sort().join(',') === 'code,message',
    Object.keys(login.blocked?.body ?? {}).join(','));
  check('standard RateLimit headers are sent, and the legacy ones are not',
    login.blocked?.headers.get('ratelimit') !== null && login.blocked?.headers.get('x-ratelimit-limit') === null,
    String(login.blocked?.headers.get('ratelimit')));

  console.log('\nFORGOT PASSWORD — mail flooding, and the enumeration guarantee under load');
  const known = await post('/auth/forgot-password', { email: 'limiter@example.com' });
  const unknown = await post('/auth/forgot-password', { email: 'nobody-at-all@example.com' });
  check('known and unknown addresses still answer identically',
    known.status === unknown.status && JSON.stringify(known.body) === JSON.stringify(unknown.body),
    `${known.status} ${JSON.stringify(known.body)}`);
  const forgot = await spend('/auth/forgot-password', { email: 'limiter@example.com' },
    AUTH_RATE_LIMITS.forgotPassword.limit - 2);
  check('the limiter fires', forgot.blocked !== null);
  check('it answers 429 TOO_MANY_REQUESTS',
    forgot.blocked?.status === 429 && forgot.blocked?.body['code'] === 'TOO_MANY_REQUESTS');
  const blockedUnknown = await post('/auth/forgot-password', { email: 'nobody-at-all@example.com' });
  check('once limited, a known and an unknown address are STILL indistinguishable',
    blockedUnknown.status === forgot.blocked?.status &&
      JSON.stringify(blockedUnknown.body) === JSON.stringify(forgot.blocked?.body),
    `${blockedUnknown.status} ${JSON.stringify(blockedUnknown.body)}`);

  console.log('\nRESET PASSWORD — guessing a dead link must not be free either');
  const reset = await spend('/auth/reset-password',
    { token: '0'.repeat(64), password: 'CorrectHorse42!' }, AUTH_RATE_LIMITS.resetPassword.limit);
  check('the limiter fires', reset.blocked !== null);
  check('it answers 429 TOO_MANY_REQUESTS',
    reset.blocked?.status === 429 && reset.blocked?.body['code'] === 'TOO_MANY_REQUESTS');

  console.log('\nREGISTER — automated account creation');
  const register = await spend('/auth/register', { email: 'not-an-email' }, AUTH_RATE_LIMITS.register.limit);
  check('the limiter fires ahead of validation', register.blocked !== null);
  check('it answers 429 TOO_MANY_REQUESTS',
    register.blocked?.status === 429 && register.blocked?.body['code'] === 'TOO_MANY_REQUESTS');

  console.log('\nSCOPE — ordinary application traffic is untouched');
  const health = await fetch(`${API}/health`);
  check('an unlimited route still answers after every auth limiter is spent', health.status === 200,
    String(health.status));

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(2);
});
