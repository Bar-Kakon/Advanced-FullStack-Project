/**
 * Signing out ends the session, and does nothing else.
 *
 * Boots the real application on an ephemeral port and drives it over real HTTP, carrying the
 * refresh cookie the way a browser would.
 */
import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { RefreshTokenModel } from '../src/features/auth/refreshToken.model.js';
import { UserModel } from '../src/features/users/user.model.js';
import { cleanUp } from './support/accounts.js';
import { check, finish, section, startHarness } from './support/harness.js';

const MARKER = 'logout-verify';
const PASSWORD = 'CorrectHorse42!';

/** The browser's job, done by hand: keep the Set-Cookie value and send it back. */
const cookieFrom = (response: Response): string | null => {
  const header = response.headers.get('set-cookie');
  if (header === null) return null;

  const pair = header.split(';')[0] ?? '';
  return pair.startsWith('refreshToken=') ? pair : null;
};

const run = async (): Promise<never> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);

  const email = `${MARKER}.1.${Date.now()}@example.com`;
  const companyName = `${MARKER} 1 ${Date.now()} Ltd`;

  const registered = await fetch(`${baseUrl}/api/auth/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      firstName: 'Logout', lastName: 'Tester', standing: 'owner', companyName,
      email, password: PASSWORD, confirmPassword: PASSWORD,
      registrationCategory: 'contractor', specialty: 'electrical', city: 'חיפה', region: 'haifa',
      availability: 'open', acceptedTerms: true, operationalEmail: true,
    }),
  });
  if (registered.status !== 201) throw new Error(`register: ${registered.status}`);

  section('1. A signed-in session works');
  const signIn = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const session = (await signIn.json()) as { accessToken: string };
  const cookie = cookieFrom(signIn);
  check(signIn.status === 200 && Boolean(session.accessToken), 'login issues an Access Token');
  check(cookie !== null, 'and sets a refresh cookie');

  const me = await fetch(`${baseUrl}/api/users/me`, {
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  check(me.status === 200, 'a protected route answers', me.status);

  const userBefore = await UserModel.findOne({ email }).lean().exec();
  const membershipBefore = await CompanyMembershipModel
    .findOne({ user: userBefore!._id } as Record<string, unknown>).lean().exec();

  section('2. Refresh works before signing out');
  const refreshed = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST', headers: { Cookie: cookie! },
  });
  check(refreshed.status === 200, 'refresh answers 200', refreshed.status);
  const rotated = cookieFrom(refreshed);
  check(rotated !== null, 'and rotates the cookie');
  check(rotated !== cookie, 'to a different value');

  section('3. Signing out');
  const loggedOut = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST', headers: { Cookie: rotated! },
  });
  check(loggedOut.status === 204, 'logout answers 204', loggedOut.status);
  const cleared = loggedOut.headers.get('set-cookie') ?? '';
  check(/refreshToken=;|refreshToken=""/.test(cleared) || /Expires=Thu, 01 Jan 1970/.test(cleared),
    'and clears the refresh cookie', cleared.split(';')[0]);

  section('4. That session can no longer be refreshed');
  const afterLogout = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST', headers: { Cookie: rotated! },
  });
  check(afterLogout.status === 401, 'the revoked token is refused', afterLogout.status);

  const original = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST', headers: { Cookie: cookie! },
  });
  check(original.status === 401, 'and so is the earlier token in the same family', original.status);

  section('5. Repeating it is safe, and says nothing');
  const again = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST', headers: { Cookie: rotated! },
  });
  check(again.status === 204, 'a second logout still answers 204', again.status);

  const noCookie = await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST' });
  check(noCookie.status === 204, 'logout with no cookie at all answers 204', noCookie.status);

  const nonsense = await fetch(`${baseUrl}/api/auth/logout`, {
    method: 'POST', headers: { Cookie: 'refreshToken=not-a-real-token' },
  });
  check(nonsense.status === 204, 'and so does a made-up token — nothing is revealed', nonsense.status);

  section('6. The account itself is untouched');
  const userAfter = await UserModel.findOne({ email }).lean().exec();
  const membershipAfter = await CompanyMembershipModel
    .findOne({ user: userAfter!._id } as Record<string, unknown>).lean().exec();

  check(userAfter !== null, 'the user still exists');
  check(userAfter?.status === 'active', 'and is still active', userAfter?.status);
  check(userAfter?.firstName === userBefore?.firstName
    && userAfter?.lastName === userBefore?.lastName, 'the name is unchanged');
  check(String(userAfter?.updatedAt) === String(userBefore?.updatedAt),
    'the user document was not written at all');
  check(membershipAfter?.status === membershipBefore?.status
    && String(membershipAfter?.company) === String(membershipBefore?.company),
    'the company relationship is unchanged');

  section('7. And the person can sign in again');
  const back = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const fresh = (await back.json()) as { accessToken?: string };
  check(back.status === 200 && Boolean(fresh.accessToken), 'login works normally afterwards', back.status);

  const freshCookie = cookieFrom(back);
  const freshRefresh = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST', headers: { Cookie: freshCookie! },
  });
  check(freshRefresh.status === 200, 'and the new session refreshes', freshRefresh.status);

  section('8. Only this session was revoked');
  const other = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PASSWORD }),
  });
  const otherCookie = cookieFrom(other);
  await fetch(`${baseUrl}/api/auth/logout`, { method: 'POST', headers: { Cookie: freshCookie! } });

  const otherStillWorks = await fetch(`${baseUrl}/api/auth/refresh`, {
    method: 'POST', headers: { Cookie: otherCookie! },
  });
  check(otherStillWorks.status === 200,
    'a second device keeps its own session', otherStillWorks.status);

  const families = await RefreshTokenModel.countDocuments({ user: userAfter!._id } as Record<string, unknown>).exec();
  check(families > 0, 'the token rows are kept as history, not deleted', families);

  await cleanUp(MARKER);
  await RefreshTokenModel.deleteMany({ user: userAfter!._id } as Record<string, unknown>).exec();
  return finish(harness);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(2);
});