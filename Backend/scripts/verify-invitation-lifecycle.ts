/**
 * Cancelling a pending employee invitation, and the Main Contractor seat.
 *
 * Boots the real application on an ephemeral port, so the auth rate limiter starts fresh and no
 * separately running server is needed.
 */
import { CompanyModel } from '../src/features/companies/company.model.js';
import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { createAccount, cleanUp } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'invite-verify';
const PASSWORD = 'CorrectHorse42!';

const run = async (): Promise<never> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await cleanUp(MARKER);

  const owner = await createAccount(baseUrl, MARKER, 1);
  const stranger = await createAccount(baseUrl, MARKER, 2);

  const ownerCompany = await CompanyModel.findById(owner.companyId).lean().exec();
  const companyName = ownerCompany?.name ?? '';

  const invite = (token: string, fullName: string, companyPosition: string) =>
    request(baseUrl, 'POST', '/api/companies/employees/invitations', {
      token, json: { fullName, companyPosition },
    });
  const cancel = (token: string | undefined, id: string) =>
    request(baseUrl, 'DELETE', `/api/companies/employees/invitations/${id}`, token ? { token } : {});

  section('1. An authorised manager cancels a pending invitation');
  const opened = await invite(owner.token, 'Pending Person', 'site_manager');
  check(opened.status === 201, 'a seat is opened', opened.body);
  const invitationId = opened.body['invitationId'] as string;

  const listed = await request(baseUrl, 'GET', '/api/companies/employees', { token: owner.token });
  const rows = listed.body['memberships'] as { id: string; status: string }[];
  check(rows.some((row) => row.id === invitationId && row.status === 'invited'),
    'the pending row is listed as invited');

  const cancelled = await cancel(owner.token, invitationId);
  check(cancelled.status === 200, 'cancelling answers 200', cancelled.body);
  check(cancelled.body['cancelled'] === true, 'and says so plainly');

  section('2. The seat is really gone, and the row is kept as history');
  const row = await CompanyMembershipModel.findById(invitationId).lean().exec();
  check(row !== null, 'the row still exists rather than being destroyed');
  check(row?.status === 'inactive', 'its status moved to inactive', row?.status);
  check(row?.user === null || row?.user === undefined, 'and it never gained a user');

  const after = await request(baseUrl, 'GET', '/api/companies/employees', { token: owner.token });
  const afterRows = after.body['memberships'] as { id: string; status: string }[];
  check(!afterRows.some((r) => r.id === invitationId && r.status === 'invited'),
    'it is no longer an open invitation');

  section('3. A cancelled seat can no longer be claimed by registration');
  const claimant = await request(baseUrl, 'POST', '/api/auth/register', {
    json: {
      firstName: 'Pending', lastName: 'Person', standing: 'employee',
      companyName, companyPosition: 'site_manager',
      email: `${MARKER}.claim.${Date.now()}@example.com`,
      password: PASSWORD, confirmPassword: PASSWORD,
      registrationCategory: 'contractor', specialty: 'drilling', city: 'חיפה', region: 'haifa',
    acceptedTerms: true, operationalEmail: true,
    },
  });
  check(claimant.status !== 201, 'a withdrawn seat cannot be claimed', claimant.status);

  section('4. Cancelling again fails safely');
  const twice = await cancel(owner.token, invitationId);
  check(twice.status === 404, 'a second cancel answers 404, it does not throw', twice.status);
  check(twice.body['code'] === 'PENDING_INVITATION_NOT_FOUND', 'with a named code', twice.body['code']);

  section('5. Authorisation is company-scoped');
  const second = await invite(owner.token, 'Another Person', 'contractor');
  const secondId = second.body['invitationId'] as string;

  const byStranger = await cancel(stranger.token, secondId);
  check(byStranger.status === 404, 'another company cannot cancel this invitation', byStranger.status);
  const stillOpen = await CompanyMembershipModel.findById(secondId).lean().exec();
  check(stillOpen?.status === 'invited', 'and the invitation is untouched', stillOpen?.status);

  const anonymous = await cancel(undefined, secondId);
  check(anonymous.status === 401, 'an unauthenticated caller is refused', anonymous.status);

  section('6. An employee without the capability cannot cancel');
  const employeeEmail = `${MARKER}.employee.${Date.now()}@example.com`;
  const seat = await invite(owner.token, 'Joining Person', 'employee');
  const joined = await request(baseUrl, 'POST', '/api/auth/register', {
    json: {
      firstName: 'Joining', lastName: 'Person', standing: 'employee',
      companyName, companyPosition: 'employee',
      email: employeeEmail, password: PASSWORD, confirmPassword: PASSWORD,
      registrationCategory: 'contractor', specialty: 'drilling', city: 'חיפה', region: 'haifa',
    acceptedTerms: true, operationalEmail: true,
    },
  });
  check(joined.status === 201, 'the employee claimed their seat', joined.body);
  await request(baseUrl, 'POST', `/api/companies/employees/${seat.body['invitationId']}/approve`,
    { token: owner.token });

  const employeeSignIn = await request(baseUrl, 'POST', '/api/auth/login', {
    json: { email: employeeEmail, password: PASSWORD },
  });
  const employeeToken = employeeSignIn.body['accessToken'] as string;
  const byEmployee = await cancel(employeeToken, secondId);
  check(byEmployee.status === 403, 'an employee without the permission is refused', byEmployee.status);
  check(byEmployee.body['code'] === 'COMPANY_PERMISSION_DENIED', 'with the permission code', byEmployee.body['code']);

  section('7. An accepted membership is not a pending invitation');
  const ownerMembership = await CompanyMembershipModel
    .findOne({ company: owner.companyId, standing: 'owner' }).lean().exec();
  const cancelActive = await cancel(owner.token, String(ownerMembership?._id));
  check(cancelActive.status === 404, 'an active membership cannot be cancelled this way', cancelActive.status);
  const ownerStill = await CompanyMembershipModel.findById(ownerMembership?._id).lean().exec();
  check(ownerStill?.status === 'active', 'and the owner is still active', ownerStill?.status);

  const employeeMembership = await CompanyMembershipModel
    .findOne({ company: owner.companyId, invitedFullName: 'Joining Person' }).lean().exec();
  const cancelApproved = await cancel(owner.token, String(employeeMembership?._id));
  check(cancelApproved.status === 404, 'nor can an approved employee be removed as an invitation',
    cancelApproved.status);

  section('8. The Main Contractor seat is already the owner’s');
  const selfInvite = await invite(owner.token, 'Verify Account1', 'main_contractor');
  check(selfInvite.status === 409, 'inviting a second Main Contractor is refused', selfInvite.status);
  check(selfInvite.body['code'] === 'MAIN_CONTRACTOR_SEAT_TAKEN', 'with a named code', selfInvite.body['code']);

  const anyName = await invite(owner.token, 'Somebody Else Entirely', 'main_contractor');
  check(anyName.status === 409, 'and the refusal does not depend on the name typed', anyName.status);

  const otherPosition = await invite(owner.token, 'Site Person', 'site_manager');
  check(otherPosition.status === 201, 'every other position may still be invited', otherPosition.status);

  const invitedSeats = await CompanyMembershipModel
    .countDocuments({ company: owner.companyId, companyPosition: 'main_contractor',
      standing: 'employee' }).exec();
  check(invitedSeats === 0, 'no Main Contractor seat was opened by the refused attempts', invitedSeats);

  const holders = await CompanyMembershipModel
    .countDocuments({ company: owner.companyId, companyPosition: 'main_contractor',
      status: { $in: ['invited', 'pending_company_approval', 'active'] } }).exec();
  check(holders === 1, 'and the company still has exactly one Main Contractor: its owner', holders);

  await cleanUp(MARKER);
  return finish(harness);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(2);
});
