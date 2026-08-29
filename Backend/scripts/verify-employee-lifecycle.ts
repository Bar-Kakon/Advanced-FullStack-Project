/**
 * Walks the approved employee lifecycle end to end, against the running server and real database:
 *
 *   owner registers → owner invites (invited) → employee self-registers (pending_company_approval)
 *   → owner approves (active)
 *
 * Needs a FRESHLY STARTED server: it spends a large share of the register rate-limit budget.
 * Start the API (`npm run dev`), then: `npm run verify:employee-lifecycle`.
 */
import { config as loadEnvFile } from 'dotenv';

import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { loadConfig } from '../src/config/env.js';
import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { CompanyModel } from '../src/features/companies/company.model.js';
import { UserModel } from '../src/features/users/user.model.js';

const API = 'http://localhost:3000/api';
const MARKER = 'emp-verify';
const COMPANY = `${MARKER} Ltd`;
const PASSWORD = 'CorrectHorse42!';

let failures = 0;
const check = (label: string, passed: boolean, detail = ''): void => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${label.padEnd(68)} ${detail}`);
};

interface Reply { readonly status: number; readonly body: Record<string, unknown> }

const send = async (method: string, path: string, payload?: unknown, token?: string): Promise<Reply> => {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const reply = {
    status: response.status,
    body: (await response.json().catch(() => ({}))) as Record<string, unknown>,
  };
  if (reply.status === 429) {
    throw new Error(`A rate limiter answered on ${path}. Restart the API and retry — counters are in memory.`);
  }
  return reply;
};

const account = (first: string, last: string, extra: Record<string, unknown>) => ({
  firstName: first,
  lastName: last,
  email: `${MARKER}-${first.toLowerCase()}-${last.toLowerCase()}@example.com`,
  password: PASSWORD,
  confirmPassword: PASSWORD,
  specialty: 'electrical',
  city: 'חיפה',
  region: 'haifa',
  acceptedTerms: true,
  ...extra,
});

const wipe = async (): Promise<void> => {
  const users = await UserModel.find({ email: { $regex: `^${MARKER}` } }).distinct('_id');
  const companies = await CompanyModel.find({ name: COMPANY }).distinct('_id');
  await CompanyMembershipModel.deleteMany({ $or: [{ user: { $in: users } }, { company: { $in: companies } }] });
  await CompanyModel.deleteMany({ name: COMPANY });
  await UserModel.deleteMany({ email: { $regex: `^${MARKER}` } });
};

const run = async (): Promise<void> => {
  loadEnvFile({ quiet: true });
  await connectToDatabase(loadConfig().mongoUri);
  await wipe();

  console.log('\n1. The owner registers and gets the canonical owner relationship');
  const ownerRegistered = await send('POST', '/auth/register',
    account('Orit', 'Owner', { standing: 'owner', companyName: COMPANY, availability: 'open' }));
  check('owner registration answers 201 with no session',
    ownerRegistered.status === 201 && !('accessToken' in ownerRegistered.body));

  const ownerLogin = await send('POST', '/auth/login', { email: `${MARKER}-orit-owner@example.com`, password: PASSWORD });
  const ownerToken = ownerLogin.body['accessToken'] as string;
  check('the owner can sign in', ownerLogin.status === 200 && !!ownerToken);

  const companyId = (await CompanyModel.findOne({ name: COMPANY }).select('_id').lean())?._id;
  if (!companyId) throw new Error('the owner registration created no company');
  const ownerRow = await CompanyMembershipModel.findOne({ company: companyId, standing: 'owner' }).lean();
  check('exactly one owner membership exists, active, with the four permissions',
    ownerRow?.status === 'active' && (ownerRow?.permissions ?? []).length === 4,
    `${ownerRow?.status} · ${(ownerRow?.permissions ?? []).join(',')}`);

  console.log('\n2. Registering as an employee with no invitation creates NOTHING');
  const uninvited = await send('POST', '/auth/register',
    account('Nobody', 'Uninvited', { standing: 'employee', companyName: COMPANY, companyPosition: 'employee' }));
  check('it is refused with INVITATION_NOT_FOUND',
    uninvited.status === 409 && uninvited.body['code'] === 'INVITATION_NOT_FOUND',
    `${uninvited.status} ${String(uninvited.body['code'])}`);
  check('and no account was created for them',
    (await UserModel.countDocuments({ email: `${MARKER}-nobody-uninvited@example.com` })) === 0);

  console.log('\n3. The owner opens a seat');
  const invited = await send('POST', '/companies/employees/invitations',
    { fullName: 'Erez Employee', companyPosition: 'site_manager' }, ownerToken);
  check('the invitation is created', invited.status === 201 && typeof invited.body['invitationId'] === 'string',
    `${invited.status}`);
  const seat = await CompanyMembershipModel.findById(String(invited.body['invitationId'])).lean();
  check('the seat is `invited`, has NO user, and carries no permissions',
    seat?.status === 'invited' && seat?.user === null && (seat?.permissions ?? []).length === 0,
    `${seat?.status} · user=${String(seat?.user)} · perms=${(seat?.permissions ?? []).length}`);
  check('it records the name and the position it will be matched on',
    seat?.invitedFullName === 'Erez Employee' && seat?.companyPosition === 'site_manager');

  console.log('\n4. A registration that does not match the seat is still refused');
  const wrongPosition = await send('POST', '/auth/register',
    account('Erez', 'Employee', { standing: 'employee', companyName: COMPANY, companyPosition: 'contractor' }));
  check('a mismatched company position does not claim the seat',
    wrongPosition.status === 409 && wrongPosition.body['code'] === 'INVITATION_NOT_FOUND');
  const wrongCompany = await send('POST', '/auth/register',
    account('Erez', 'Employee', { standing: 'employee', companyName: 'Some Other Ltd', companyPosition: 'site_manager' }));
  check('a different company name does not claim it either',
    wrongCompany.status === 409 && wrongCompany.body['code'] === 'INVITATION_NOT_FOUND');
  check('the seat is untouched by either attempt',
    (await CompanyMembershipModel.findById(seat?._id).lean())?.status === 'invited');

  console.log('\n4b. An employee may supply their own professional details, and not the company\'s');
  const withOfficePhone = await send('POST', '/auth/register',
    account('Erez', 'Employee', { standing: 'employee', companyName: COMPANY, companyPosition: 'site_manager', officePhone: '04-8123456' }));
  check('an employee is refused the company office phone', withOfficePhone.status === 400, String(withOfficePhone.status));
  const withAvailability = await send('POST', '/auth/register',
    account('Erez', 'Employee', { standing: 'employee', companyName: COMPANY, companyPosition: 'site_manager', availability: 'open' }));
  check('an employee is refused the company availability', withAvailability.status === 400, String(withAvailability.status));

  console.log('\n5. The invited employee registers and claims the seat');
  // Their own number, trade, city and region are ordinary profile data and travel with them.
  const employeeRegistered = await send('POST', '/auth/register',
    account('Erez', 'Employee', {
      standing: 'employee', companyName: COMPANY, companyPosition: 'site_manager',
      businessPhone: '052-5550199',
    }));
  check('the registration is accepted', employeeRegistered.status === 201, JSON.stringify(employeeRegistered.body));
  check('it opened no session', !('accessToken' in employeeRegistered.body));

  const employeeId = (await UserModel.findOne({ email: `${MARKER}-erez-employee@example.com` }).select('_id').lean())?._id;
  if (!employeeId) throw new Error('the employee registration created no account');
  const claimed = await CompanyMembershipModel.findById(seat?._id).lean();
  check('the seat is now pending_company_approval', claimed?.status === 'pending_company_approval', String(claimed?.status));
  check('it is bound to the new account', String(claimed?.user) === String(employeeId));
  check('the employee is NOT active yet', claimed?.status !== 'active');
  check('the employee holds no permissions', (claimed?.permissions ?? []).length === 0);
  check('no second company was created', (await CompanyModel.countDocuments({ name: COMPANY })) === 1);
  check('the employee holds exactly one membership', (await CompanyMembershipModel.countDocuments({ user: employeeId })) === 1);
  const employeeDoc = await UserModel.findById(employeeId).select('businessPhone specialties location').lean();
  check('their own business phone, trade and location were stored on their user document',
    employeeDoc?.businessPhone === '052-5550199' &&
      (employeeDoc?.specialties ?? []).length === 1 &&
      employeeDoc?.location?.region === 'haifa',
    `${String(employeeDoc?.businessPhone)} · ${(employeeDoc?.specialties ?? []).join(',')} · ${String(employeeDoc?.location?.region)}`);

  console.log('\n6. Only somebody with the permission may approve');
  const employeeLogin = await send('POST', '/auth/login', { email: `${MARKER}-erez-employee@example.com`, password: PASSWORD });
  const employeeToken = employeeLogin.body['accessToken'] as string;
  check('the pending employee can still sign in to their own account', employeeLogin.status === 200 && !!employeeToken);
  const selfApprove = await send('POST', `/companies/employees/${String(seat?._id)}/approve`, undefined, employeeToken);
  check('the employee cannot approve themselves',
    selfApprove.status === 403 && selfApprove.body['code'] === 'NO_ACTIVE_COMPANY',
    `${selfApprove.status} ${String(selfApprove.body['code'])}`);
  const anonymous = await send('POST', `/companies/employees/${String(seat?._id)}/approve`);
  check('an unauthenticated caller is refused', anonymous.status === 401);

  console.log('\n7. The owner sees the pending activation and approves it');
  const listed = await send('GET', '/companies/employees', undefined, ownerToken);
  const rows = (listed.body['memberships'] ?? []) as { status: string; invitedFullName: string | null }[];
  check('the list shows the owner and the pending employee', listed.status === 200 && rows.length === 2, `${rows.length} rows`);
  check('the pending row is named, so the owner knows who they are approving',
    rows.some((r) => r.status === 'pending_company_approval' && r.invitedFullName === 'Erez Employee'));

  const approved = await send('POST', `/companies/employees/${String(seat?._id)}/approve`, undefined, ownerToken);
  check('the approval succeeds', approved.status === 200 && approved.body['approved'] === 1, JSON.stringify(approved.body));
  const activated = await CompanyMembershipModel.findById(seat?._id).lean();
  check('the membership is now active', activated?.status === 'active', String(activated?.status));
  check('approval granted no permissions', (activated?.permissions ?? []).length === 0);
  check('and no owner standing', activated?.standing === 'employee', String(activated?.standing));

  console.log('\n8. Approving every waiting activation at once');
  const secondSeat = await send('POST', '/companies/employees/invitations',
    { fullName: 'Batch One', companyPosition: 'contractor' }, ownerToken);
  const thirdSeat = await send('POST', '/companies/employees/invitations',
    { fullName: 'Batch Two', companyPosition: 'contractor' }, ownerToken);
  await send('POST', '/auth/register',
    account('Batch', 'One', { standing: 'employee', companyName: COMPANY, companyPosition: 'contractor' }));
  await send('POST', '/auth/register',
    account('Batch', 'Two', { standing: 'employee', companyName: COMPANY, companyPosition: 'contractor' }));
  const pendingBefore = await CompanyMembershipModel.countDocuments({ status: 'pending_company_approval' });
  const bulk = await send('POST', '/companies/employees/approve-all', undefined, ownerToken);
  check('both waiting activations move in one call',
    bulk.status === 200 && bulk.body['approved'] === pendingBefore && pendingBefore === 2,
    `${JSON.stringify(bulk.body)} (pending before: ${pendingBefore})`);
  check('nothing is left pending',
    (await CompanyMembershipModel.countDocuments({ status: 'pending_company_approval' })) === 0);
  check('the two batch seats are active',
    (await CompanyMembershipModel.countDocuments({
      _id: { $in: [String(secondSeat.body['invitationId']), String(thirdSeat.body['invitationId'])] },
      status: 'active',
    })) === 2);

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
