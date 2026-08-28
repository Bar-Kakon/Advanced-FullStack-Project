/**
 * Proves the Register transaction is all-or-nothing.
 *
 * It builds the real registration use case with the real repositories and the real transaction
 * runner, then makes one write fail on purpose and checks that nothing survives. A failure injected
 * from outside is the only way to reach the abort path deterministically — the race the unique
 * index closes cannot be scheduled on demand.
 *
 *   npm run verify:register-txn
 */
import { config as loadEnvFile } from 'dotenv';
import mongoose from 'mongoose';

import { loadConfig } from '../src/config/env.js';
import { connectToDatabase, disconnectFromDatabase, runInTransaction } from '../src/db/mongoose.js';
import { CompanyModel } from '../src/features/companies/company.model.js';
import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { companyMembershipRepository } from '../src/features/companies/companyMembership.repository.js';
import { companyRepository } from '../src/features/companies/company.repository.js';
import { UserModel } from '../src/features/users/user.model.js';
import { userRepository } from '../src/features/users/user.repository.js';
import { passwordService } from '../src/features/auth/password.service.js';
import {
  createRegistrationService,
  type RegistrationDependencies,
} from '../src/features/auth/registration.service.js';
import type { RegisterBody } from '../src/features/auth/auth.validation.js';

const MARKER = 'txn-verify';
const EMAIL = `${MARKER}@example.com`;
const COMPANY = `${MARKER} Ltd`;

const body: RegisterBody = {
  firstName: 'Txn',
  lastName: 'Verify',
  companyName: COMPANY,
  email: EMAIL,
  password: 'CorrectHorse42!',
  confirmPassword: 'CorrectHorse42!',
  specialty: 'drilling',
  city: 'חיפה',
  region: 'haifa',
  availability: 'open',
  acceptedTerms: true,
};

/** Tokens are not what is under test here; the HTTP verification covers the real pair. */
const stubTokenPair = {
  issue: async () => ({ accessToken: 'stub', refreshToken: 'stub' }),
};

const baseDeps = (): Omit<RegistrationDependencies, 'memberships' | 'users'> => ({
  companies: companyRepository,
  passwords: passwordService,
  tokenPair: stubTokenPair,
  transactions: { run: runInTransaction },
});

const countLeftovers = async (): Promise<{ companies: number; users: number; memberships: number }> => {
  const companies = await CompanyModel.countDocuments({ name: COMPANY });
  const users = await UserModel.countDocuments({ email: EMAIL });
  const ids = await CompanyModel.find({ name: COMPANY }).distinct('_id');
  const memberships = await CompanyMembershipModel.countDocuments({ company: { $in: ids } });
  return { companies, users, memberships };
};

const wipe = async (): Promise<void> => {
  const ids = await CompanyModel.find({ name: COMPANY }).distinct('_id');
  await CompanyMembershipModel.deleteMany({ company: { $in: ids } });
  await CompanyModel.deleteMany({ name: COMPANY });
  await UserModel.deleteMany({ email: EMAIL });
};

let failures = 0;

const check = (label: string, passed: boolean, detail: string): void => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} ${detail}`);
};

const run = async (): Promise<void> => {
  loadEnvFile({ quiet: true });
  await connectToDatabase(loadConfig().mongoUri);
  await wipe();

  console.log('\n1. The membership write fails — the third and last document');
  const failingMemberships = {
    create: async (): Promise<never> => {
      throw new Error('injected failure: membership write');
    },
  };
  try {
    await createRegistrationService({
      ...baseDeps(),
      users: userRepository,
      memberships: failingMemberships,
    }).register(body);
    check('register rejected', false, 'it resolved, which it must not');
  } catch (error) {
    check('register rejected', true, `-> ${(error as Error).message}`);
  }
  let left = await countLeftovers();
  check('no orphan Company remains', left.companies === 0, `companies=${left.companies}`);
  check('no User remains', left.users === 0, `users=${left.users}`);
  check('no membership remains', left.memberships === 0, `memberships=${left.memberships}`);

  console.log('\n2. The user write fails — the company was already written in this transaction');
  const failingUsers = {
    ...userRepository,
    create: async (): Promise<never> => {
      throw new Error('injected failure: user write');
    },
  };
  try {
    await createRegistrationService({
      ...baseDeps(),
      users: failingUsers,
      memberships: companyMembershipRepository,
    }).register(body);
    check('register rejected', false, 'it resolved, which it must not');
  } catch (error) {
    check('register rejected', true, `-> ${(error as Error).message}`);
  }
  left = await countLeftovers();
  check('the Company rolled back too', left.companies === 0, `companies=${left.companies}`);
  check('no User remains', left.users === 0, `users=${left.users}`);
  check('no membership remains', left.memberships === 0, `memberships=${left.memberships}`);

  console.log('\n3. Nothing injected — all three commit together');
  const result = await createRegistrationService({
    ...baseDeps(),
    users: userRepository,
    memberships: companyMembershipRepository,
  }).register(body);
  left = await countLeftovers();
  check('exactly one Company', left.companies === 1, `companies=${left.companies}`);
  check('exactly one User', left.users === 1, `users=${left.users}`);
  check('exactly one membership', left.memberships === 1, `memberships=${left.memberships}`);

  const membership = await CompanyMembershipModel.findOne({ user: result.user.id }).lean();
  check('standing is owner', membership?.standing === 'owner', `standing=${membership?.standing}`);
  check('status is active', membership?.status === 'active', `status=${membership?.status}`);
  check(
    'owner holds the four default permissions',
    membership?.permissions.length === 4,
    JSON.stringify(membership?.permissions),
  );
  const user = await UserModel.findOne({ email: EMAIL }).lean();
  check(
    'the user document carries NO company fields',
    user !== null && !('company' in user) && !('companyStanding' in user),
    Object.keys(user ?? {}).filter((k) => k.toLowerCase().includes('company')).join(',') || 'none',
  );

  console.log('\n4. A second active membership for the same person is refused');
  try {
    await CompanyMembershipModel.create({
      company: new mongoose.Types.ObjectId(),
      user: result.user.id,
      standing: 'employee',
      status: 'active',
      permissions: [],
    });
    check('partial unique index refused it', false, 'the insert succeeded, which it must not');
  } catch (error) {
    check('partial unique index refused it', true, `-> code ${(error as { code?: number }).code}`);
  }

  await wipe();
  await disconnectFromDatabase();

  console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error: unknown) => {
  console.error('verification crashed:', error);
  process.exit(1);
});
