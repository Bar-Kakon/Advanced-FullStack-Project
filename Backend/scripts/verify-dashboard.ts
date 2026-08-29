/**
 * Drives the real Personal dashboard endpoints over real HTTP against real accounts.
 *
 * Every number the dashboard reports is checked against the state that produced it, so a value
 * that is merely plausible cannot pass.
 */
import { BlockModel } from '../src/features/blocks/block.model.js';
import { CompanyModel } from '../src/features/companies/company.model.js';
import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { ConnectionModel } from '../src/features/connections/connection.model.js';
import { ProfileReminderDismissalModel } from '../src/features/dashboard/profileReminderDismissal.model.js';
import { UserModel } from '../src/features/users/user.model.js';
import { createAccount, cleanUp } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'verify-dashboard';

interface DashboardBody {
  dashboard: {
    identity: { firstName: string; lastName: string; email: string; avatarUrl: string | null };
    company: { id: string; name: string; standing: string; availability: string } | null;
    network: { connected: number; incoming: number; outgoing: number; blocked: number };
    team: { pendingApproval: number; openInvitations: number; active: number } | null;
    reputation: { rating: { average: number; count: number } | null; completedWork: number };
    profileReminder: {
      visible: boolean;
      version: number;
      missing: { key: string; importance: string }[];
      dismissedKeys: string[];
    };
  };
}

const dashboardOf = async (baseUrl: string, token: string) => {
  const response = await request(baseUrl, 'GET', '/api/dashboard', { token });
  return { status: response.status, ...(response.body as unknown as DashboardBody) };
};

const run = async (): Promise<void> => {
  const harness = await startHarness();
  const { baseUrl } = harness;

  await cleanUp(MARKER);

  const alice = await createAccount(baseUrl, MARKER, 1);
  const bob = await createAccount(baseUrl, MARKER, 2);
  const carol = await createAccount(baseUrl, MARKER, 3);

  section('Authentication');
  const anonymous = await request(baseUrl, 'GET', '/api/dashboard');
  check(anonymous.status === 401, 'GET /api/dashboard without a token is 401', anonymous.body);

  const badToken = await request(baseUrl, 'GET', '/api/dashboard', { token: 'not-a-token' });
  check(badToken.status === 401, 'GET /api/dashboard with a junk token is 401', badToken.status);

  const anonymousDismiss = await request(baseUrl, 'POST', '/api/dashboard/profile-reminder/dismiss');
  check(anonymousDismiss.status === 401, 'Dismiss without a token is 401', anonymousDismiss.status);

  section('Identity and company scoping');
  const a0 = await dashboardOf(baseUrl, alice.token);
  check(a0.status === 200, 'GET /api/dashboard is 200 for a signed-in caller', a0.status);
  check(a0.dashboard.identity.email === alice.email, 'Identity is the caller, not another account');
  check(a0.dashboard.identity.avatarUrl === null, 'No avatar means null, never a fabricated URL');
  check(a0.dashboard.company !== null, 'The owner account carries its company');
  check(
    a0.dashboard.company?.id === alice.companyId.toString(),
    'The company is the caller’s own company',
    a0.dashboard.company?.id,
  );

  const b0 = await dashboardOf(baseUrl, bob.token);
  check(
    b0.dashboard.company?.id === bob.companyId.toString() &&
      b0.dashboard.company?.id !== a0.dashboard.company?.id,
    'A second account sees its own company, never the first’s',
  );

  section('Network counts are the real edges');
  check(
    a0.dashboard.network.connected === 0 &&
      a0.dashboard.network.incoming === 0 &&
      a0.dashboard.network.outgoing === 0,
    'A fresh account reports zero connections — a real computed zero',
    a0.dashboard.network,
  );

  await request(baseUrl, 'POST', `/api/connections/${bob.userId.toString()}/request`, {
    token: alice.token,
  });

  const a1 = await dashboardOf(baseUrl, alice.token);
  const b1 = await dashboardOf(baseUrl, bob.token);
  check(a1.dashboard.network.outgoing === 1, 'The requester counts one outgoing', a1.dashboard.network);
  check(a1.dashboard.network.incoming === 0, 'The requester counts no incoming', a1.dashboard.network);
  check(b1.dashboard.network.incoming === 1, 'The recipient counts one incoming', b1.dashboard.network);
  check(b1.dashboard.network.outgoing === 0, 'The recipient counts no outgoing', b1.dashboard.network);

  const c1 = await dashboardOf(baseUrl, carol.token);
  check(
    c1.dashboard.network.incoming === 0 && c1.dashboard.network.outgoing === 0,
    'An uninvolved third account sees none of that traffic',
    c1.dashboard.network,
  );

  await request(baseUrl, 'POST', `/api/connections/${alice.userId.toString()}/accept`, {
    token: bob.token,
  });

  const a2 = await dashboardOf(baseUrl, alice.token);
  const b2 = await dashboardOf(baseUrl, bob.token);
  check(
    a2.dashboard.network.connected === 1 && a2.dashboard.network.outgoing === 0,
    'Acceptance moves the requester from outgoing to connected',
    a2.dashboard.network,
  );
  check(
    b2.dashboard.network.connected === 1 && b2.dashboard.network.incoming === 0,
    'Acceptance moves the recipient from incoming to connected',
    b2.dashboard.network,
  );

  await request(baseUrl, 'POST', `/api/connections/${bob.userId.toString()}/remove`, {
    token: alice.token,
  });
  const a3 = await dashboardOf(baseUrl, alice.token);
  check(
    a3.dashboard.network.connected === 0,
    'A removed connection stops being counted as connected',
    a3.dashboard.network,
  );

  section('Blocks are counted for the blocker only');
  await request(baseUrl, 'PUT', `/api/blocks/${carol.userId.toString()}`, { token: alice.token });

  const a4 = await dashboardOf(baseUrl, alice.token);
  const c2 = await dashboardOf(baseUrl, carol.token);
  check(a4.dashboard.network.blocked === 1, 'The blocker counts the block', a4.dashboard.network);
  check(
    c2.dashboard.network.blocked === 0,
    'The blocked person is never told — their count stays zero',
    c2.dashboard.network,
  );

  section('Reputation is real, and an unrated account is not a zero');
  check(
    a4.dashboard.reputation.rating === null,
    'An unrated account reports null, never an average of 0',
    a4.dashboard.reputation.rating,
  );
  check(
    a4.dashboard.reputation.completedWork === 0,
    'Completed work is a real count of real entries',
    a4.dashboard.reputation.completedWork,
  );

  section('Team counts are scoped to the caller’s company');
  check(a4.dashboard.team !== null, 'A company owner receives team counts');
  check(
    a4.dashboard.team?.active === 1 && a4.dashboard.team?.pendingApproval === 0,
    'A fresh company counts exactly its owner as active',
    a4.dashboard.team,
  );

  await request(baseUrl, 'POST', '/api/companies/employees/invitations', {
    token: alice.token,
    json: { fullName: 'Dana Levi', companyPosition: 'site_manager' },
  });

  const a5 = await dashboardOf(baseUrl, alice.token);
  check(
    a5.dashboard.team?.openInvitations === 1,
    'An open invitation is counted',
    a5.dashboard.team,
  );

  const b5 = await dashboardOf(baseUrl, bob.token);
  check(
    b5.dashboard.team?.openInvitations === 0,
    'Another company never sees that invitation',
    b5.dashboard.team,
  );

  section('Profile reminder — contents');
  const reminder = a5.dashboard.profileReminder;
  const keys = reminder.missing.map((item) => item.key);
  check(reminder.visible, 'A fresh account has a visible reminder', reminder.visible);
  check(
    !keys.includes('contactRoute'),
    'Contact is satisfied by the account email alone, so it is never listed',
    keys,
  );
  check(
    !keys.includes('specialties') && !keys.includes('region'),
    'Register collected specialty and region, so neither is reported missing',
    keys,
  );
  check(keys.includes('bio') && keys.includes('avatar'), 'Genuinely absent fields are listed', keys);
  check(
    reminder.missing.every((item) => item.importance === 'required' || item.importance === 'suggested'),
    'Every item is labelled required or suggested',
  );
  check(
    reminder.missing.filter((item) => item.key === 'businessPhone')[0]?.importance === 'suggested',
    'Business phone is a suggestion, never a requirement',
  );
  check(
    keys.includes('officePhone'),
    'A company manager is offered the office phone',
    keys,
  );

  section('Profile reminder — dismissal persists');
  const dismissed = await request(baseUrl, 'POST', '/api/dashboard/profile-reminder/dismiss', {
    token: alice.token,
  });
  check(dismissed.status === 200, 'Dismiss answers 200', dismissed.status);

  const a6 = await dashboardOf(baseUrl, alice.token);
  check(!a6.dashboard.profileReminder.visible, 'The reminder is hidden after dismissal');
  check(
    a6.dashboard.profileReminder.missing.length > 0,
    'The missing list is still reported — dismissal hides the reminder, it does not fake completeness',
  );

  const again = await request(baseUrl, 'POST', '/api/dashboard/profile-reminder/dismiss', {
    token: alice.token,
  });
  const a7 = await dashboardOf(baseUrl, alice.token);
  check(again.status === 200 && !a7.dashboard.profileReminder.visible, 'Dismissing twice is harmless');

  const rows = await ProfileReminderDismissalModel.countDocuments({ user: alice.userId }).exec();
  check(rows === 1, 'Dismissing twice writes one row, not two', rows);

  const b6 = await dashboardOf(baseUrl, bob.token);
  check(
    b6.dashboard.profileReminder.visible,
    'One account’s dismissal never hides another account’s reminder',
  );

  section('Profile reminder — progress keeps it hidden, a new gap brings it back');
  await UserModel.updateOne({ _id: alice.userId }, { $set: { bio: 'Real bio text.' } }).exec();
  const a8 = await dashboardOf(baseUrl, alice.token);
  check(
    !a8.dashboard.profileReminder.visible,
    'Filling one listed item does not resurrect a dismissed reminder',
  );
  check(
    !a8.dashboard.profileReminder.missing.map((item) => item.key).includes('bio'),
    'The filled item leaves the missing list',
  );

  await UserModel.updateOne({ _id: alice.userId }, { $set: { specialties: [] } }).exec();
  const a9 = await dashboardOf(baseUrl, alice.token);
  check(
    a9.dashboard.profileReminder.visible,
    'A gap that was never dismissed brings the reminder back',
    a9.dashboard.profileReminder.missing.map((item) => item.key),
  );
  check(
    a9.dashboard.profileReminder.missing.some(
      (item) => item.key === 'specialties' && item.importance === 'required',
    ),
    'The new gap is reported, and as required',
  );

  section('Deactivated account');
  await UserModel.updateOne({ _id: carol.userId }, { $set: { status: 'deactivated' } }).exec();
  const deactivated = await request(baseUrl, 'GET', '/api/dashboard', { token: carol.token });
  check(
    deactivated.status === 401 || deactivated.status === 404,
    'A deactivated account cannot read a dashboard',
    deactivated.status,
  );

  const userIds = [alice.userId, bob.userId, carol.userId];
  await ProfileReminderDismissalModel.deleteMany({ user: { $in: userIds } }).exec();
  await ConnectionModel.deleteMany({
    $or: [{ requester: { $in: userIds } }, { recipient: { $in: userIds } }],
  }).exec();
  await BlockModel.deleteMany({
    $or: [{ blockerUserId: { $in: userIds } }, { blockedUserId: { $in: userIds } }],
  }).exec();
  await CompanyMembershipModel.deleteMany({
    company: { $in: [alice.companyId, bob.companyId, carol.companyId] },
  }).exec();
  await CompanyModel.deleteMany({ name: new RegExp(`^${MARKER} `) }).exec();
  await cleanUp(MARKER);

  await finish(harness);
};

void run();
