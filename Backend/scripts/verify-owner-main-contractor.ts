/**
 * A registered owner is recorded as their company's Main Contractor.
 *
 * Boots the real application on an ephemeral port, so nothing else needs to be running.
 */
import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { createAccount, cleanUp } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'ownerpos-verify';
const PASSWORD = 'CorrectHorse42!';

const run = async (): Promise<never> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);

  section('1. Registration records the owner as Main Contractor');
  const owner = await createAccount(baseUrl, MARKER, 1);
  const membership = await CompanyMembershipModel
    .findOne({ user: owner.userId }).lean().exec();

  check(membership?.standing === 'owner', 'the owner relationship exists', membership?.standing);
  check(membership?.companyPosition === 'main_contractor',
    'and it names main_contractor', membership?.companyPosition);
  check(membership?.status === 'active', 'and it is active immediately', membership?.status);
  check((membership?.permissions ?? []).includes('company.invite_employees'),
    'the approved owner permissions are still granted');

  section('2. The profile reports the position without inventing one');
  const signIn = await request(baseUrl, 'POST', '/api/auth/login', {
    json: { email: owner.email, password: PASSWORD },
  });
  const me = await request(baseUrl, 'GET', '/api/users/me', {
    token: signIn.body['accessToken'] as string,
  });
  const profile = me.body['user'] as Record<string, unknown>;
  check(profile['standing'] === 'owner', 'standing is owner', profile['standing']);
  check(profile['companyPosition'] === 'main_contractor',
    'companyPosition is main_contractor', profile['companyPosition']);

  section('3. An employee is unaffected');
  const company = await CompanyMembershipModel.findOne({ user: owner.userId }).lean().exec();
  const seat = await request(baseUrl, 'POST', '/api/companies/employees/invitations', {
    token: signIn.body['accessToken'] as string,
    json: { fullName: 'Ordinary Person', companyPosition: 'site_manager' },
  });
  check(seat.status === 201, 'a site manager seat opens normally', seat.status);
  const seatRow = await CompanyMembershipModel.findById(seat.body['invitationId'] as string).lean().exec();
  check(seatRow?.companyPosition === 'site_manager',
    'and it keeps the position it was opened for', seatRow?.companyPosition);
  check(seatRow?.company?.toString() === company?.company?.toString(),
    'in the owner’s own company');

  section('4. The backfill is narrow and repeatable');
  await CompanyMembershipModel.updateOne(
    { user: owner.userId }, { $unset: { companyPosition: '' } },
  ).exec();
  const stripped = await CompanyMembershipModel.findOne({ user: owner.userId }).lean().exec();
  check(stripped?.companyPosition === undefined, 'a legacy owner row has no position');

  const { migrateOwnerPositions } = await import('./support/ownerPositionBackfill.js');
  const moved = await migrateOwnerPositions();
  check(moved >= 1, 'the backfill claims at least this row', moved);

  const healed = await CompanyMembershipModel.findOne({ user: owner.userId }).lean().exec();
  check(healed?.companyPosition === 'main_contractor', 'the legacy owner now names the job',
    healed?.companyPosition);

  const again = await migrateOwnerPositions();
  check(again === 0, 'running it a second time changes nothing', again);

  check(seatRow?.companyPosition === 'site_manager',
    'and it never rewrote a row that already named a job');

  await cleanUp(MARKER);
  return finish(harness);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(2);
});
