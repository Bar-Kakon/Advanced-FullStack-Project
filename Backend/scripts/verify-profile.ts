/**
 * Proves the profile read and write rules over real HTTP.
 *
 * It checks four things the screens depend on: the payload never carries a secret, an update writes
 * only allowlisted fields, company values are read from the company and edited only with the
 * company permission, and ratings are honestly empty rather than invented.
 *
 *   npm run verify:profile
 */
import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { UserModel } from '../src/features/users/user.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'profile-verify';

/** Anything here appearing on the wire would be a leak, whatever the route intended. */
const FORBIDDEN_KEYS = [
  'passwordHash',
  'password',
  'passwordChangedAt',
  'tokenVersion',
  'refreshToken',
  'refreshTokens',
  'resetToken',
  'resetTokenHash',
  'permissions',
  '__v',
  '_id',
];

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);

  const owner = await createAccount(baseUrl, MARKER, 1);

  section('GET /api/users/me');
  const me = await request(baseUrl, 'GET', '/api/users/me', { token: owner.token });
  const user = (me.body['user'] ?? {}) as Record<string, unknown>;

  check(me.status === 200, 'returns 200 for an authenticated caller', me.status);
  const leaked = FORBIDDEN_KEYS.filter((key) => key in user);
  check(leaked.length === 0, 'carries no credential, token or internal field', leaked);
  check(user['email'] === owner.email, 'identifies the caller from the token, not the URL', user['email']);
  check(user['companyName'] !== null, 'resolves the company name from the company document');
  check(user['availability'] === 'open', 'resolves availability from the company', user['availability']);
  check(
    user['rating'] === null && user['flexibility'] === null &&
      Array.isArray(user['ratings']) && (user['ratings'] as unknown[]).length === 0,
    'reports an empty rating state instead of inventing numbers',
  );

  section('GET without a token');
  const anonymous = await request(baseUrl, 'GET', '/api/users/me');
  check(anonymous.status === 401, 'is refused with 401', anonymous.status);

  section('PATCH /api/users/me — allowlist');
  const patched = await request(baseUrl, 'PATCH', '/api/users/me', {
    token: owner.token,
    json: {
      firstName: 'Renamed',
      bio: 'Twenty years of drilling.',
      city: 'תל אביב',
      travelRadiusKm: 60,
      delayToleranceDays: 3,
      noticeRequiredDays: 2,
      // None of the rest may ever be written through this route.
      email: 'attacker@example.com',
      status: 'banned',
      profileComplete: true,
      companyName: 'Hijacked Ltd',
      availability: 'limited',
      passwordHash: 'x',
    },
  });
  const updated = (patched.body['user'] ?? {}) as Record<string, unknown>;

  check(patched.status === 200, 'accepts the allowlisted fields', patched.status);
  check(updated['firstName'] === 'Renamed', 'writes firstName', updated['firstName']);
  check(updated['travelRadiusKm'] === 60, 'writes travelRadiusKm', updated['travelRadiusKm']);
  check(updated['email'] === owner.email, 'ignores an email in the body', updated['email']);
  check(updated['companyName'] !== 'Hijacked Ltd', 'ignores a company name in the body');
  check(updated['availability'] === 'open', 'ignores availability in the body', updated['availability']);

  const stored = await UserModel.findById(owner.userId).lean().exec();
  check(stored?.status === 'active', 'never wrote the smuggled status', stored?.status);
  check(stored?.email === owner.email, 'never wrote the smuggled email');

  section('PATCH /api/users/me — refusals');
  const empty = await request(baseUrl, 'PATCH', '/api/users/me', { token: owner.token, json: {} });
  check(empty.status === 400, 'refuses an empty patch', empty.status);

  const outOfRange = await request(baseUrl, 'PATCH', '/api/users/me', {
    token: owner.token,
    json: { travelRadiusKm: 5000 },
  });
  check(outOfRange.status === 400, 'refuses an out-of-range travel radius', outOfRange.status);

  const badTrade = await request(baseUrl, 'PATCH', '/api/users/me', {
    token: owner.token,
    json: { specialties: ['not-a-trade'] },
  });
  check(badTrade.status === 400, 'refuses a specialty outside the approved list', badTrade.status);

  section('PATCH /api/companies/me');
  const company = await request(baseUrl, 'PATCH', '/api/companies/me', {
    token: owner.token,
    json: { name: `${MARKER} renamed`, officePhone: '03-1234567', availability: 'limited' },
  });
  const afterCompany = (company.body['user'] ?? {}) as Record<string, unknown>;

  check(company.status === 200, 'lets a permitted caller edit the company', company.status);
  check(afterCompany['companyName'] === `${MARKER} renamed`, 'writes the company name');
  check(afterCompany['availability'] === 'limited', 'writes availability', afterCompany['availability']);

  // The permission is what grants this, so removing it must close the route immediately.
  await CompanyMembershipModel.updateOne({ user: owner.userId }, { $set: { permissions: [] } }).exec();
  const denied = await request(baseUrl, 'PATCH', '/api/companies/me', {
    token: owner.token,
    json: { name: 'Should not happen' },
  });
  check(denied.status === 403, 'refuses a caller without company.manage', denied.status);
  check(denied.body['code'] === 'COMPANY_PERMISSION_DENIED', 'answers with the documented code', denied.body);

  await cleanUp(MARKER);
  await finish(harness);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
