/**
 * Access Token invalidation is decided by an account-level version, not by comparing clocks.
 *
 * Boots the real application on an ephemeral port and drives it over real HTTP. The formerly racy
 * case is not waited for: tokens are signed with an `iat` chosen adversarially — the exact second
 * of the reset, and a second after it — so the timing that used to let a token survive is forced
 * rather than hoped for.
 */
import { config as loadEnvFile } from 'dotenv';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';

import { loadConfig } from '../src/config/env.js';
import { passwordResetTokenRepository } from '../src/features/auth/passwordResetToken.repository.js';
import { ACCESS_TOKEN_PURPOSE } from '../src/features/auth/tokens/token.types.js';
import { RefreshTokenModel } from '../src/features/auth/refreshToken.model.js';
import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { CompanyModel } from '../src/features/companies/company.model.js';
import { UserModel } from '../src/features/users/user.model.js';
import { check, finish, section, startHarness } from './support/harness.js';

const MARKER = 'tokenver-verify';
const OLD_PASSWORD = 'CorrectHorse42!';
const NEW_PASSWORD = 'BrandNewHorse99!';

loadEnvFile({ quiet: true });
const config = loadConfig();
const SECRET = config.tokens.accessSecret;

interface Session {
  readonly accessToken: string;
  readonly cookie: string | null;
}

const cookieFrom = (response: Response): string | null => {
  const header = response.headers.get('set-cookie');
  if (header === null) return null;

  const pair = header.split(';')[0] ?? '';
  return pair.startsWith('refreshToken=') ? pair : null;
};

const registerAccount = async (baseUrl: string, index: number, email: string): Promise<void> => {
  const response = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Version', lastName: `Tester${index}`, standing: 'owner',
      companyName: `${MARKER} ${index} ${Date.now()} Ltd`,
      email, password: OLD_PASSWORD, confirmPassword: OLD_PASSWORD,
      registrationCategory: 'contractor', specialty: 'electrical', city: 'חיפה', region: 'haifa',
      availability: 'open', acceptedTerms: true, operationalEmail: true,
    }),
  });
  if (response.status !== 201) throw new Error(`register ${index}: ${response.status}`);
};

const login = async (baseUrl: string, email: string, password: string): Promise<Session> => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  if (response.status === 429) throw new Error('a rate limiter answered; the login budget is spent');

  const body = (await response.json().catch(() => ({}))) as { accessToken?: string };
  return { accessToken: body.accessToken ?? '', cookie: cookieFrom(response) };
};

const loginStatus = async (baseUrl: string, email: string, password: string): Promise<number> => {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  return response.status;
};

const protectedStatus = async (baseUrl: string, token?: string): Promise<number> => {
  const response = await fetch(`${baseUrl}/api/health-auth`, {
    headers: token === undefined ? {} : { Authorization: `Bearer ${token}` },
  });
  return response.status;
};

const withCookie = async (baseUrl: string, path: string, cookie: string | null): Promise<number> => {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie === null ? {} : { Cookie: cookie }) },
    body: '{}',
  });
  return response.status;
};

const refresh = async (baseUrl: string, cookie: string | null): Promise<Session & { status: number }> => {
  const response = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie === null ? {} : { Cookie: cookie }) },
    body: '{}',
  });
  const body = (await response.json().catch(() => ({}))) as { accessToken?: string };
  return { status: response.status, accessToken: body.accessToken ?? '', cookie: cookieFrom(response) };
};

/** The `ver` claim a real token carries, or `undefined` when it carries none. */
const versionOf = (token: string): number | undefined =>
  (jwt.verify(token, SECRET) as { ver?: number }).ver;

/** A token this script controls completely: any `iat`, any `ver`, or no `ver` at all. */
const forge = (userId: string, claims: { iat: number; ver?: number }): string =>
  jwt.sign(
    { sub: userId, typ: ACCESS_TOKEN_PURPOSE, iat: claims.iat, ...(claims.ver === undefined ? {} : { ver: claims.ver }) },
    SECRET,
    { expiresIn: config.tokens.accessTtlSeconds },
  );

/**
 * `exp` is supplied rather than derived, so an `iat` far in the past still leaves a live token —
 * which is the only way to ask whether the old timestamp comparison is really out of the decision.
 */
const forgeWithLifetime = (userId: string, iat: number, ver: unknown): string =>
  jwt.sign(
    { sub: userId, typ: ACCESS_TOKEN_PURPOSE, iat, exp: Math.floor(Date.now() / 1000) + 900, ver },
    SECRET,
  );

const storedVersion = async (userId: Types.ObjectId): Promise<number | undefined> =>
  (await UserModel.findById(userId).select('security.tokenVersion').lean().exec())?.security?.tokenVersion;

const resetPasswordTo = async (
  baseUrl: string,
  userId: Types.ObjectId,
  password: string,
): Promise<number> => {
  const { rawToken } = await passwordResetTokenRepository.issueFor(
    userId,
    new Date(Date.now() + 30 * 60 * 1000),
  );
  const response = await fetch(`${baseUrl}/api/auth/reset-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: rawToken, password }),
  });
  return response.status;
};

const wipe = async (): Promise<void> => {
  const users = await UserModel.find({ email: new RegExp(`^${MARKER}\\.`) }).select('_id').lean().exec();
  const userIds = users.map((user) => user._id);

  await RefreshTokenModel.deleteMany({ user: { $in: userIds } }).exec();
  await CompanyMembershipModel.deleteMany({ user: { $in: userIds } }).exec();
  await CompanyModel.deleteMany({ name: new RegExp(`^${MARKER} `) }).exec();
  await UserModel.deleteMany({ _id: { $in: userIds } }).exec();
};

const run = async (): Promise<never> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await wipe();

  const stamp = Date.now();
  const emailOne = `${MARKER}.1.${stamp}@example.com`;
  const emailTwo = `${MARKER}.2.${stamp}@example.com`;
  await registerAccount(baseUrl, 1, emailOne);
  await registerAccount(baseUrl, 2, emailTwo);

  const one = await UserModel.findOne({ email: emailOne }).select('_id').lean().exec();
  const two = await UserModel.findOne({ email: emailTwo }).select('_id').lean().exec();
  if (!one || !two) throw new Error('the verification accounts were not created');

  section('1. A fresh account starts at the initial version, and Login stamps it');
  check((await storedVersion(one._id)) === 0, 'registration stores tokenVersion 0', await storedVersion(one._id));
  const sessionA = await login(baseUrl, emailOne, OLD_PASSWORD);
  check(sessionA.accessToken.length > 0, 'Login answered with an Access Token');
  check(versionOf(sessionA.accessToken) === 0, 'Access Token A carries ver 0', versionOf(sessionA.accessToken));
  check((await protectedStatus(baseUrl, sessionA.accessToken)) === 200, 'Access Token A opens a protected route');

  section('2. A password reset retires Access Token A immediately');
  check((await resetPasswordTo(baseUrl, one._id, NEW_PASSWORD)) === 200, 'the reset answered 200');
  check((await storedVersion(one._id)) === 1, 'the reset advanced the stored version to 1', await storedVersion(one._id));
  check((await protectedStatus(baseUrl, sessionA.accessToken)) === 401, 'Access Token A is rejected');

  section('3. The formerly racy timings, forced rather than waited for');
  const changedAt = (await UserModel.findById(one._id).select('security.passwordChangedAt').lean().exec())
    ?.security?.passwordChangedAt;
  check(changedAt instanceof Date, 'the reset still stamped passwordChangedAt, as security history', String(changedAt));
  const resetSecond = Math.floor((changedAt?.getTime() ?? Date.now()) / 1000);

  const sameSecond = forge(one._id.toString(), { iat: resetSecond, ver: 0 });
  check((await protectedStatus(baseUrl, sameSecond)) === 401,
    'a token whose iat is the exact second of the reset is rejected');

  const sameMillisecond = forge(one._id.toString(), { iat: resetSecond, ver: 0 });
  check((await protectedStatus(baseUrl, sameMillisecond)) === 401,
    'and so is a second token minted in that same second');

  const afterTheReset = forge(one._id.toString(), { iat: resetSecond + 5, ver: 0 });
  check((await protectedStatus(baseUrl, afterTheReset)) === 401,
    'an iat five seconds AFTER the reset cannot rescue the retired version');

  const wrongWayUp = forge(one._id.toString(), { iat: resetSecond, ver: 9 });
  check((await protectedStatus(baseUrl, wrongWayUp)) === 401,
    'a version higher than the account’s is rejected too — the rule is equality, not ordering');

  section('4. A token issued after the reset is accepted');
  const sessionB = await login(baseUrl, emailOne, NEW_PASSWORD);
  check(versionOf(sessionB.accessToken) === 1, 'Access Token B carries ver 1', versionOf(sessionB.accessToken));
  check((await protectedStatus(baseUrl, sessionB.accessToken)) === 200, 'Access Token B opens a protected route');
  check((await protectedStatus(baseUrl)) === 401, 'a request with no token is still refused');

  section('5. A second reset retires the first post-reset token');
  check((await resetPasswordTo(baseUrl, one._id, OLD_PASSWORD)) === 200, 'the second reset answered 200');
  check((await storedVersion(one._id)) === 2, 'the stored version advanced to 2', await storedVersion(one._id));
  check((await protectedStatus(baseUrl, sessionB.accessToken)) === 401, 'Access Token B is now rejected');
  const sessionC = await login(baseUrl, emailOne, OLD_PASSWORD);
  check(versionOf(sessionC.accessToken) === 2, 'Access Token C carries ver 2', versionOf(sessionC.accessToken));
  check((await protectedStatus(baseUrl, sessionC.accessToken)) === 200, 'Access Token C opens a protected route');

  section('6. A token predating the claim reads as version 0');
  const legacy = forge(two._id.toString(), { iat: Math.floor(Date.now() / 1000) });
  check(versionOf(legacy) === undefined, 'the legacy token carries no ver claim at all');
  check((await protectedStatus(baseUrl, legacy)) === 200,
    'before any increment it is accepted — deployment logs nobody out');
  check((await resetPasswordTo(baseUrl, two._id, NEW_PASSWORD)) === 200, 'that account then resets its password');
  check((await protectedStatus(baseUrl, legacy)) === 401, 'and the same legacy token is now rejected');

  section('7. Refresh mints Access Tokens at the current version');
  const rotating = await login(baseUrl, emailTwo, NEW_PASSWORD);
  const rotated = await refresh(baseUrl, rotating.cookie);
  check(rotated.status === 200, 'Refresh answered 200', rotated.status);
  check(versionOf(rotated.accessToken) === (await storedVersion(two._id)),
    'the rotated Access Token carries the account’s current version', versionOf(rotated.accessToken));
  check((await protectedStatus(baseUrl, rotated.accessToken)) === 200, 'and it opens a protected route');

  section('8. Refresh replay still revokes the whole family');
  const replayed = await refresh(baseUrl, rotating.cookie);
  check(replayed.status === 401, 'presenting a spent Refresh Token is refused', replayed.status);
  const afterReplay = await refresh(baseUrl, rotated.cookie);
  check(afterReplay.status === 401, 'and the token that replaced it is revoked with the family', afterReplay.status);
  check((await storedVersion(two._id)) === 1,
    'reuse detection did not touch the token version', await storedVersion(two._id));

  section('9. Logout stays per-family');
  const familyX = await login(baseUrl, emailTwo, NEW_PASSWORD);
  const familyY = await login(baseUrl, emailTwo, NEW_PASSWORD);
  const versionBeforeLogout = await storedVersion(two._id);
  check((await withCookie(baseUrl, '/api/auth/logout', familyX.cookie)) === 204,
    'signing one session out answers 204');
  check((await refresh(baseUrl, familyX.cookie)).status === 401, 'that family can no longer refresh');
  const otherFamily = await refresh(baseUrl, familyY.cookie);
  check(otherFamily.status === 200, 'the other family still refreshes', otherFamily.status);
  check((await storedVersion(two._id)) === versionBeforeLogout,
    'logout advanced no version, so it is not an account-wide sign-out');
  check((await protectedStatus(baseUrl, familyY.accessToken)) === 200,
    'and the other session’s Access Token still works');

  section('10. The account-status rule is unchanged');
  await UserModel.updateOne({ _id: one._id }, { $set: { status: 'banned' } }).exec();
  check((await protectedStatus(baseUrl, sessionC.accessToken)) === 401,
    'a current-version token is refused once the account is not permitted a session');
  check((await loginStatus(baseUrl, emailOne, OLD_PASSWORD)) === 401, 'Login refuses the same account');
  await UserModel.updateOne({ _id: one._id }, { $set: { status: 'active' } }).exec();
  check((await protectedStatus(baseUrl, sessionC.accessToken)) === 200,
    'restoring the status restores the very same token — no version was spent');

  section('11. A stored record with no tokenVersion at all behaves as version 0');
  // What an account written before this field existed actually looks like on disk.
  await UserModel.updateOne({ _id: two._id }, { $unset: { 'security.tokenVersion': '' } }).exec();
  check((await storedVersion(two._id)) === undefined, 'the field is genuinely absent from the document');
  const nowSecond = Math.floor(Date.now() / 1000);
  check((await protectedStatus(baseUrl, forge(two._id.toString(), { iat: nowSecond }))) === 200,
    'a token with no ver claim is accepted against the absent field');
  check((await protectedStatus(baseUrl, forge(two._id.toString(), { iat: nowSecond, ver: 0 }))) === 200,
    'and so is an explicit ver 0');
  check((await protectedStatus(baseUrl, forge(two._id.toString(), { iat: nowSecond, ver: 1 }))) === 401,
    'while ver 1 is refused — the absent field is 0, not a wildcard');
  const legacyLogin = await login(baseUrl, emailTwo, NEW_PASSWORD);
  check(versionOf(legacyLogin.accessToken) === 0,
    'Login against the absent field stamps 0', versionOf(legacyLogin.accessToken));
  check((await resetPasswordTo(baseUrl, two._id, OLD_PASSWORD)) === 200, 'that account resets its password');
  check((await storedVersion(two._id)) === 1,
    '$inc on the absent field lands on 1, so no backfill is required', await storedVersion(two._id));
  check((await protectedStatus(baseUrl, legacyLogin.accessToken)) === 401,
    'and the token issued before that reset is now refused');

  section('12. A malformed ver claim is refused rather than coerced');
  const current = (await storedVersion(two._id)) ?? 0;
  for (const [label, value] of [
    ['a string', String(current)],
    ['a float', current + 0.5],
    ['null', null],
    ['a boolean', true],
    ['an object', { v: current }],
  ] as const) {
    check((await protectedStatus(baseUrl, forgeWithLifetime(two._id.toString(), nowSecond, value))) === 401,
      `ver as ${label} is refused`);
  }

  section('13. passwordChangedAt is stored, and no longer decides anything');
  const stamped = (await UserModel.findById(two._id).select('security.passwordChangedAt').lean().exec())
    ?.security?.passwordChangedAt;
  check(stamped instanceof Date, 'the reset still stamped it', String(stamped));
  check(!!stamped && Date.now() - stamped.getTime() < 60_000,
    'and it records this reset, not an older one', String(stamped));
  // An hour before the last password change, carrying the current version. The old rule refused
  // exactly this; the new rule has no reason to look at the clock at all.
  const ancient = Math.floor(((stamped?.getTime() ?? Date.now()) - 60 * 60 * 1000) / 1000);
  check((await protectedStatus(baseUrl, forgeWithLifetime(two._id.toString(), ancient, current))) === 200,
    'a token whose iat predates the password change by an hour is ACCEPTED on a matching version');
  check((await protectedStatus(baseUrl, forgeWithLifetime(two._id.toString(), ancient, current - 1))) === 401,
    'and the same ancient token on the previous version is refused — the version is the whole rule');

  await wipe();
  return finish(harness);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(2);
});
