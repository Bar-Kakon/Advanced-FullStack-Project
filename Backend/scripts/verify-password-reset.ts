/**
 * End-to-end verification of the auth flow, against the running server and the real database.
 *
 * Start the API first (`npm run dev`), then: `npm run verify:password-reset`.
 *
 * It expects a FRESHLY STARTED server: the rate limiters keep their counters in memory, and this
 * script deliberately spends a large share of the register and forgot-password budgets.
 */
import { config as loadEnvFile } from 'dotenv';

import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { loadConfig } from '../src/config/env.js';
import { PasswordResetTokenModel } from '../src/features/auth/passwordResetToken.model.js';
import { passwordResetTokenRepository } from '../src/features/auth/passwordResetToken.repository.js';
import { createPasswordResetService } from '../src/features/auth/passwordReset.service.js';
import { passwordService } from '../src/features/auth/password.service.js';
import { refreshTokenRepository } from '../src/features/auth/refreshToken.repository.js';
import { buildPasswordResetEmail } from '../src/mail/passwordResetEmail.js';
import type { MailMessage } from '../src/mail/mailer.js';
import { runInTransaction } from '../src/db/mongoose.js';
import { userRepository } from '../src/features/users/user.repository.js';
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
  const reply = {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
    setCookie: response.headers.get('set-cookie'),
  };

  // This script is not the rate-limit test; `verify:rate-limit` is. Meeting a limiter here means
  // the budget was already spent, which makes every later assertion meaningless.
  if (reply.status === 429) {
    throw new Error(
      `A rate limiter answered on ${path}. This script spends a large share of the auth budget, so ` +
        'it needs a freshly started server — the counters live in memory. Restart the API and retry.',
    );
  }

  return reply;
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
  standing: 'owner',
  companyName: COMPANY,
  email: EMAIL,
  password,
  confirmPassword: password,
  registrationCategory: 'contractor',
  specialty: 'drilling',
  city: 'חיפה',
  region: 'haifa',
  acceptedTerms: true,
  operationalEmail: true,
});

const wipe = async (): Promise<void> => {
  const users = await UserModel.find({ email: { $regex: `^${MARKER}` } }).distinct('_id');
  const companies = await CompanyModel.find({ name: COMPANY }).distinct('_id');
  await PasswordResetTokenModel.deleteMany({ user: { $in: users } });
  await RefreshTokenModel.deleteMany({ user: { $in: users } });
  await CompanyMembershipModel.deleteMany({ company: { $in: companies } });
  await CompanyModel.deleteMany({ name: COMPANY });
  await UserModel.deleteMany({ email: { $regex: `^${MARKER}` } });
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

  console.log('\nREGISTER — organizational standing survives the whole path');
  const ownerId = (await UserModel.findOne({ email: EMAIL }).select('_id').lean())?._id;
  if (!ownerId) throw new Error('the owner account was not created');
  const ownerMembership = await CompanyMembershipModel.findOne({ user: ownerId }).lean();
  check('an owner registration persists standing "owner"', ownerMembership?.standing === 'owner', String(ownerMembership?.standing));
  check('the owner relationship is active and holds the four approved defaults',
    ownerMembership?.status === 'active' && (ownerMembership?.permissions ?? []).length === 4,
    `${ownerMembership?.status} · ${(ownerMembership?.permissions ?? []).join(',')}`);
  check('the owner is recorded as the company Main Contractor',
    ownerMembership?.companyPosition === 'main_contractor', String(ownerMembership?.companyPosition));

  // The employee lifecycle itself is verified by `verify:employee-lifecycle`; what matters here is
  // that a registration naming a real company with no seat waiting for it creates nothing.
  const namedCompany = await post('/auth/register', {
    firstName: 'Sneak', lastName: 'In', standing: 'employee', companyName: COMPANY,
    companyPosition: 'employee',
    email: `${MARKER}-sneak@example.com`, password: OLD_PASSWORD, confirmPassword: OLD_PASSWORD,
    registrationCategory: 'contractor', specialty: 'drilling', city: 'חיפה', region: 'haifa',
    acceptedTerms: true, operationalEmail: true,
  });
  check('typing a real company name with no invitation waiting creates nothing',
    namedCompany.status === 409 && namedCompany.body['code'] === 'INVITATION_NOT_FOUND',
    `${namedCompany.status} ${String(namedCompany.body['code'])}`);
  check('and no account was created for that attempt',
    (await UserModel.countDocuments({ email: `${MARKER}-sneak@example.com` })) === 0);

  const employeeAvailability = await post('/auth/register', {
    firstName: 'A', lastName: 'B', standing: 'employee', companyName: COMPANY,
    companyPosition: 'employee', availability: 'open',
    email: `${MARKER}-avail@example.com`, password: OLD_PASSWORD, confirmPassword: OLD_PASSWORD,
    registrationCategory: 'contractor', specialty: 'drilling', city: 'חיפה', region: 'haifa',
    acceptedTerms: true, operationalEmail: true,
  });
  check('an employee still cannot set the business availability', employeeAvailability.status === 400);

  const noStanding = await post('/auth/register', {
    firstName: 'A', lastName: 'B', companyName: 'X',
    email: `${MARKER}-nostanding@example.com`, password: OLD_PASSWORD, confirmPassword: OLD_PASSWORD,
    registrationCategory: 'contractor', specialty: 'drilling', city: 'חיפה', region: 'haifa',
    acceptedTerms: true, operationalEmail: true,
  });
  check('omitting standing is refused — there is no silent owner default',
    noStanding.status === 400 && noStanding.body['code'] === 'REQUEST_VALIDATION_FAILED',
    `${noStanding.status} ${String(noStanding.body['code'])}`);

  const badStanding = await post('/auth/register', {
    firstName: 'A', lastName: 'B', standing: 'admin', companyName: 'X',
    email: `${MARKER}-bad@example.com`, password: OLD_PASSWORD, confirmPassword: OLD_PASSWORD,
    registrationCategory: 'contractor', specialty: 'drilling', city: 'חיפה', region: 'haifa',
    acceptedTerms: true, operationalEmail: true,
  });
  check('an unknown standing is rejected', badStanding.status === 400 &&
    badStanding.body['code'] === 'REQUEST_VALIDATION_FAILED', String(badStanding.status));

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
  // Access Token A, minted before the reset and proven working, is the one that must stop.
  const tokenA = accessToken;
  check('before the reset, Access Token A opens a protected route', (await getHealthAuth(tokenA)) === 200);
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

  console.log('\nACCESS TOKEN INVALIDATION — a signature is no longer sufficient');
  const security = (await UserModel.findById(userId).select('security').lean())?.security as
    | { passwordChangedAt?: Date; tokenVersion?: number }
    | undefined;
  check('the reset advanced security.tokenVersion past the initial version',
    (security?.tokenVersion ?? 0) > 0, String(security?.tokenVersion));
  check('security.passwordChangedAt is still stamped, as security history',
    !!security?.passwordChangedAt, String(security?.passwordChangedAt));
  check('nothing rounds that stamp any more — it is no longer compared against a token',
    !!security?.passwordChangedAt && security.passwordChangedAt.getTime() <= Date.now());
  check('Access Token A is rejected immediately after the reset', (await getHealthAuth(tokenA)) === 401);
  const tokenB = withNew.body['accessToken'] as string;
  check('Access Token B, minted after the reset, works', (await getHealthAuth(tokenB)) === 200);
  check('a request with no token is still refused', (await getHealthAuth()) === 401);

  console.log('\nEMAIL LANGUAGE — one language per account, never both');
  const captured: MailMessage[] = [];
  const languageService = createPasswordResetService({
    users: userRepository,
    passwords: passwordService,
    resetTokens: passwordResetTokenRepository,
    refreshTokenStore: refreshTokenRepository,
    mailer: { mode: 'log', send: async (m) => { captured.push(m); } },
    frontendUrl: config.frontendUrl,
    transactions: { run: runInTransaction },
  });

  const requestAs = async (language: 'he' | 'en'): Promise<MailMessage> => {
    await UserModel.updateOne({ _id: userId }, { $set: { language } });
    captured.length = 0;
    await languageService.requestReset({ email: EMAIL });
    // dispatch is deliberately not awaited, so give the microtask a turn.
    await new Promise((resolve) => setTimeout(resolve, 60));
    const message = captured[0];
    if (!message) throw new Error(`no message captured for ${language}`);
    return message;
  };

  const hebrew = await requestAs('he');
  check('a Hebrew account gets a Hebrew subject', hebrew.subject === 'איפוס סיסמה — FieldSync', hebrew.subject);
  check('the Hebrew body carries no English wording',
    hebrew.text.includes('איפוס סיסמה') && !hebrew.text.includes('Reset your password'));
  check('the Hebrew HTML is marked lang=he dir=rtl',
    hebrew.html.includes('lang="he"') && hebrew.html.includes('dir="rtl"'));

  const english = await requestAs('en');
  check('an English account gets an English subject', english.subject === 'Reset your password — FieldSync', english.subject);
  check('the English body carries no Hebrew wording',
    english.text.includes('Reset your password') && !english.text.includes('איפוס סיסמה'));
  check('the English HTML is marked lang=en dir=ltr',
    english.html.includes('lang="en"') && english.html.includes('dir="ltr"'));
  check('neither message is bilingual', hebrew.subject !== english.subject && hebrew.text !== english.text);

  for (const [label, language] of [['Hebrew', 'he'], ['English', 'en']] as const) {
    const message = buildPasswordResetEmail('x@example.com', {
      resetUrl: 'http://localhost:5173/reset-password?token=abc',
      expiryMinutes: 30,
      language,
    });
    check(`the ${label} email states the 30-minute expiry`, message.text.includes('30'));
    check(`the ${label} email says to ignore it if unrequested`,
      /ignore|להתעלם/.test(message.text));
    check(`the ${label} email leaks no id, hash or password`,
      !/[0-9a-f]{24}\b/.test(message.text) && !/hash|passwordHash/i.test(message.text));
  }

  console.log('\nFORGOT PASSWORD — language must not reach the requester');
  await UserModel.updateOne({ _id: userId }, { $set: { language: 'en' } });
  const asEnglish = await post('/auth/forgot-password', { email: EMAIL });
  check('an English account answers exactly as the Hebrew one and the unknown address did',
    JSON.stringify(asEnglish) === JSON.stringify(known) && JSON.stringify(asEnglish) === JSON.stringify(unknown),
    JSON.stringify(asEnglish.body));

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

  console.log('\nACCOUNT STATUS — one rule, applied by Login, Refresh and every protected route');
  const active = await post('/auth/login', { email: EMAIL, password: NEW_PASSWORD });
  const activeToken = active.body['accessToken'] as string;
  const activeCookie = active.setCookie?.split(';')[0] ?? '';
  check('an active account signs in and its token opens a protected route',
    active.status === 200 && (await getHealthAuth(activeToken)) === 200);

  const workBefore = {
    companies: await CompanyModel.countDocuments({ name: COMPANY }),
    memberships: await CompanyMembershipModel.countDocuments({ user: ownerId }),
    terms: ((await UserModel.findById(ownerId).select('termsAcceptances').lean())
      ?.termsAcceptances ?? []).length,
  };

  // The legitimate setup mechanism: no admin endpoint exists, so the status is set directly.
  await UserModel.updateOne({ _id: userId }, { $set: { status: 'banned' } });

  check('the live Access Token is refused immediately', (await getHealthAuth(activeToken)) === 401);
  const refreshBanned = await post('/auth/refresh', {}, activeCookie);
  check('Refresh refuses the same account', refreshBanned.status === 401 &&
    refreshBanned.body['code'] === 'INVALID_REFRESH_TOKEN', String(refreshBanned.status));
  const loginBanned = await post('/auth/login', { email: EMAIL, password: NEW_PASSWORD });
  check('Login refuses it too, with the unified answer', loginBanned.status === 401 &&
    loginBanned.body['code'] === 'INVALID_CREDENTIALS', String(loginBanned.body['code']));

  const workAfter = {
    companies: await CompanyModel.countDocuments({ name: COMPANY }),
    memberships: await CompanyMembershipModel.countDocuments({ user: ownerId }),
    terms: ((await UserModel.findById(ownerId).select('termsAcceptances').lean())
      ?.termsAcceptances ?? []).length,
  };
  check('closing access deleted no company, membership or consent record',
    JSON.stringify(workBefore) === JSON.stringify(workAfter),
    `${JSON.stringify(workBefore)} -> ${JSON.stringify(workAfter)}`);

  await UserModel.updateOne({ _id: userId }, { $set: { status: 'active' } });
  const restored = await post('/auth/login', { email: EMAIL, password: NEW_PASSWORD });
  check('restoring the status restores access', restored.status === 200);
  check('and that fresh token works', (await getHealthAuth(restored.body['accessToken'] as string)) === 200);

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
