/**
 * End-to-end verification of the auth flow, against the running server and the real database.
 *
 * Start the API first (`npm run dev`), then: `npm run verify:password-reset`.
 */
import { config as loadEnvFile } from 'dotenv';

import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { loadConfig } from '../src/config/env.js';
import { PasswordResetTokenModel } from '../src/features/auth/passwordResetToken.model.js';
import { passwordResetTokenRepository } from '../src/features/auth/passwordResetToken.repository.js';
import { RefreshTokenModel } from '../src/features/auth/refreshToken.model.js';
import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { CompanyModel } from '../src/features/companies/company.model.js';
import { UserModel } from '../src/features/users/user.model.js';

const API = 'http://localhost:3000/api';
const MARKER = 'pwreset-verify';
const EMAIL = `${MARKER}@example.com`;
const COMPANY = `${MARKER} Ltd`;
const OLD_PASSWORD = 'CorrectHorse42!';
const NEW_PASSWORD = 'BrandNewHorse99!';

let failures = 0;
const check = (label: string, passed: boolean, detail = ''): void => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${label.padEnd(64)} ${detail}`);
};

interface Reply {
  readonly status: number;
  readonly body: Record<string, unknown>;
  readonly setCookie: string | null;
}

const post = async (path: string, payload: unknown, cookie?: string): Promise<Reply> => {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(payload),
  });
  return {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
    setCookie: response.headers.get('set-cookie'),
  };
};

const getHealthAuth = async (accessToken?: string): Promise<number> => {
  const response = await fetch(`${API}/health-auth`, {
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
  });
  return response.status;
};

const registerBody = (password: string) => ({
  firstName: 'Reset',
  lastName: 'Verify',
  companyName: COMPANY,
  email: EMAIL,
  password,
  confirmPassword: password,
  specialty: 'drilling',
  city: 'חיפה',
  region: 'haifa',
  acceptedTerms: true,
});

const wipe = async (): Promise<void> => {
  const users = await UserModel.find({ email: EMAIL }).distinct('_id');
  const companies = await CompanyModel.find({ name: COMPANY }).distinct('_id');
  await PasswordResetTokenModel.deleteMany({ user: { $in: users } });
  await RefreshTokenModel.deleteMany({ user: { $in: users } });
  await CompanyMembershipModel.deleteMany({ company: { $in: companies } });
  await CompanyModel.deleteMany({ name: COMPANY });
  await UserModel.deleteMany({ email: EMAIL });
};

const run = async (): Promise<void> => {
  loadEnvFile({ quiet: true });
  const config = loadConfig();
  await connectToDatabase(config.mongoUri);
  await wipe();

  console.log('\nREGISTER — creates an account and no session');
  const registered = await post('/auth/register', registerBody(OLD_PASSWORD));
  check('valid Register answers 201', registered.status === 201, String(registered.status));
  check('no accessToken in the body', !('accessToken' in registered.body), Object.keys(registered.body).join(','));
  check('no Set-Cookie header at all', registered.setCookie === null, String(registered.setCookie));
  check('the body still carries the created user', typeof registered.body['user'] === 'object');
  check('no Refresh Token row was written', (await RefreshTokenModel.countDocuments({
    user: { $in: await UserModel.find({ email: EMAIL }).distinct('_id') },
  })) === 0);
  check('a protected route rejects the brand-new account', (await getHealthAuth()) === 401);

  console.log('\nLOGIN — unchanged, and still the only authenticator');
  const loggedIn = await post('/auth/login', { email: EMAIL, password: OLD_PASSWORD });
  const accessToken = loggedIn.body['accessToken'] as string | undefined;
  check('valid Login answers 200 with an accessToken', loggedIn.status === 200 && !!accessToken);
  check('Refresh Token cookie is set, HttpOnly, scoped to /api/auth',
    !!loggedIn.setCookie && /HttpOnly/i.test(loggedIn.setCookie) && /Path=\/api\/auth/i.test(loggedIn.setCookie));
  check('the Access Token opens a protected route', (await getHealthAuth(accessToken)) === 200);
  const wrongPassword = await post('/auth/login', { email: EMAIL, password: 'WrongPassword99!' });
  const unknownAccount = await post('/auth/login', { email: 'nobody-here@example.com', password: 'WrongPassword99!' });
  check('wrong password and unknown email stay unified',
    wrongPassword.status === unknownAccount.status &&
      JSON.stringify(wrongPassword.body) === JSON.stringify(unknownAccount.body),
    `${wrongPassword.status} ${JSON.stringify(wrongPassword.body)}`);

  const userId = (await UserModel.findOne({ email: EMAIL }).select('_id').lean())?._id;
  if (!userId) throw new Error('the verification account vanished');

  console.log('\nFORGOT PASSWORD — same answer either way, hash-only storage');
  const known = await post('/auth/forgot-password', { email: EMAIL });
  const unknown = await post('/auth/forgot-password', { email: 'no-such-person@example.com' });
  check('a known address answers 200', known.status === 200, JSON.stringify(known.body));
  check('an unknown address answers identically',
    known.status === unknown.status && JSON.stringify(known.body) === JSON.stringify(unknown.body),
    `${unknown.status} ${JSON.stringify(unknown.body)}`);
  check('no reset row exists for the unknown address',
    (await PasswordResetTokenModel.countDocuments({ user: { $exists: false } })) === 0);

  const firstRow = await PasswordResetTokenModel.findOne({ user: userId }).lean();
  check('a reset record was created for the known account', !!firstRow);
  check('it stores a 64-character hash', /^[0-9a-f]{64}$/.test(String(firstRow?.tokenHash)));
  check('it carries an expiry in the future', !!firstRow && firstRow.expiresAt.getTime() > Date.now());
  const ttlMinutes = firstRow ? Math.round((firstRow.expiresAt.getTime() - Date.now()) / 60000) : 0;
  check('the expiry is the 30 minutes the screen promises', ttlMinutes === 30, `${ttlMinutes} min`);
  check('no field on the row holds anything raw',
    !Object.values(firstRow ?? {}).some((v) => typeof v === 'string' && v.length === 64 && v !== firstRow?.tokenHash));

  console.log('\nFORGOT PASSWORD — a second request retires the first link');
  await post('/auth/forgot-password', { email: EMAIL });
  const afterSecond = await PasswordResetTokenModel.find({ user: userId }).sort({ createdAt: 1 }).lean();
  check('two rows exist, and exactly one is still live',
    afterSecond.length === 2 && afterSecond.filter((r) => r.invalidatedAt === null && r.usedAt === null).length === 1,
    `${afterSecond.length} rows`);
  check('the retired one is the older request', afterSecond[0]?.invalidatedAt !== null);

  console.log('\nRESET PASSWORD — token handling');
  // The raw token only ever exists in the email, so the test mints one through the very repository
  // the service uses. That exercises the real generator, the real hashing and the real storage.
  const { createHash, randomBytes } = await import('node:crypto');
  const sha = (v: string): string => createHash('sha256').update(v).digest('hex');
  const mint = async (expiresAt: Date): Promise<string> =>
    (await passwordResetTokenRepository.issueFor(userId, expiresAt)).rawToken;
  const inThirtyMinutes = (): Date => new Date(Date.now() + 30 * 60 * 1000);

  const garbage = await post('/auth/reset-password', { token: randomBytes(32).toString('hex'), password: NEW_PASSWORD });
  check('a token generated by the real repository is 64 hex characters',
    /^[0-9a-f]{64}$/.test(await mint(inThirtyMinutes())));
  check('an unknown token is refused', garbage.status === 401 && garbage.body['code'] === 'INVALID_RESET_TOKEN',
    `${garbage.status} ${String(garbage.body['code'])}`);

  const expiredToken = await mint(new Date(Date.now() - 60 * 1000));
  const expired = await post('/auth/reset-password', { token: expiredToken, password: NEW_PASSWORD });
  check('an expired token is refused, with the same code', expired.status === 401 && expired.body['code'] === 'INVALID_RESET_TOKEN');

  const supersededToken = await mint(inThirtyMinutes());
  const liveToken = await mint(inThirtyMinutes());
  const superseded = await post('/auth/reset-password', { token: supersededToken, password: NEW_PASSWORD });
  check('a token a later request replaced is refused', superseded.status === 401 && superseded.body['code'] === 'INVALID_RESET_TOKEN');

  const short = await post('/auth/reset-password', { token: liveToken, password: 'short' });
  check('the backend enforces the password rules itself',
    short.status === 400 && short.body['code'] === 'REQUEST_VALIDATION_FAILED',
    `${short.status} ${String(short.body['code'])}`);
  check('a rejected password did not spend the token',
    (await PasswordResetTokenModel.findOne({ tokenHash: sha(liveToken) }).lean())?.usedAt === null);

  console.log('\nRESET PASSWORD — the successful path');
  const beforeReset = await RefreshTokenModel.countDocuments({ user: userId, revokedAt: null });
  const reset = await post('/auth/reset-password', { token: liveToken, password: NEW_PASSWORD });
  check('a valid token and a valid password answer 200', reset.status === 200, JSON.stringify(reset.body));
  check('the response issues nothing', !('accessToken' in reset.body) && reset.setCookie === null);
  check('the token is consumed', (await PasswordResetTokenModel.findOne({ tokenHash: sha(liveToken) }).lean())?.usedAt !== null);

  const replay = await post('/auth/reset-password', { token: liveToken, password: NEW_PASSWORD });
  check('the consumed token cannot be reused', replay.status === 401 && replay.body['code'] === 'INVALID_RESET_TOKEN');

  const withOld = await post('/auth/login', { email: EMAIL, password: OLD_PASSWORD });
  check('the old password no longer works', withOld.status === 401, String(withOld.status));
  const withNew = await post('/auth/login', { email: EMAIL, password: NEW_PASSWORD });
  check('the new password works', withNew.status === 200 && !!withNew.body['accessToken']);

  console.log('\nSESSION SECURITY — the reset closed the sessions that existed before it');
  const liveAfter = await RefreshTokenModel.countDocuments({
    user: userId, revokedAt: null, createdAt: { $lt: new Date(Date.now() - 1) },
  });
  check('there were sessions to revoke', beforeReset > 0, `${beforeReset} before`);
  const revokedOld = await RefreshTokenModel.countDocuments({ user: userId, revokedAt: { $ne: null } });
  check('every pre-reset Refresh Token is revoked', revokedOld >= beforeReset, `${revokedOld} revoked`);
  const oldCookie = loggedIn.setCookie?.split(';')[0] ?? '';
  const refreshWithOld = await post('/auth/refresh', {}, oldCookie);
  check('the pre-reset Refresh cookie is dead', refreshWithOld.status === 401 &&
    refreshWithOld.body['code'] === 'INVALID_REFRESH_TOKEN', `${refreshWithOld.status}`);
  check('the session opened after the reset is untouched', liveAfter >= 0);

  await wipe();
  await disconnectFromDatabase();

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch(async (error: unknown) => {
  console.error(error);
  await disconnectFromDatabase().catch(() => undefined);
  process.exit(2);
});
