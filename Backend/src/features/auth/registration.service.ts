import type { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import { OWNER_DEFAULT_PERMISSIONS } from '../companies/companyMembership.model.js';
import type {
  CompanyMembershipRepository,
  NewCompanyMembership,
} from '../companies/companyMembership.repository.js';
import type { CompanyRepository, NewCompany } from '../companies/company.repository.js';
import type { UserRecord } from '../users/user.model.js';
import type { NewUser, UserRepository } from '../users/user.repository.js';
import { emailAlreadyRegistered } from './auth.errors.js';
import type { RegisterBody } from './auth.validation.js';
import { toAuthenticatedUser, type AuthenticatedUser } from './authenticatedUser.mapper.js';
import type { PasswordService } from './password.service.js';
import type { TokenPair, TokenPairService } from './tokens/tokenPair.service.js';

export interface RegistrationResult extends TokenPair {
  readonly user: AuthenticatedUser;
}

export interface RegistrationService {
  register(input: RegisterBody): Promise<RegistrationResult>;
}

/** Injected rather than imported, so this use case never reaches for the database library. */
export interface TransactionRunner {
  run<T>(work: (session: DbSession) => Promise<T>): Promise<T>;
}

export interface RegistrationDependencies {
  readonly users: UserRepository;
  readonly companies: CompanyRepository;
  readonly memberships: CompanyMembershipRepository;
  readonly passwords: PasswordService;
  readonly tokenPair: TokenPairService;
  readonly transactions: TransactionRunner;
}

const DUPLICATE_KEY_CODE = 11000;

interface DuplicateKeyError {
  readonly code?: unknown;
  readonly keyPattern?: Record<string, unknown>;
}

/**
 * The unique index is the real guarantee, so the race the pre-check cannot close surfaces here as a
 * driver error — and inside the transaction it also aborts the company and the membership. Naming
 * it keeps the raw MongoDB failure off the wire and answers the same code the pre-check does.
 */
const isDuplicateEmailError = (error: unknown): boolean => {
  if (typeof error !== 'object' || error === null) return false;

  const candidate = error as DuplicateKeyError;
  return candidate.code === DUPLICATE_KEY_CODE && candidate.keyPattern?.['email'] !== undefined;
};

/** The office number belongs to the business, so it is the company document that carries it. */
const toNewCompany = (input: RegisterBody): NewCompany => ({
  name: input.companyName,
  availability: input.availability,
  ...(input.officePhone === undefined ? {} : { officePhone: input.officePhone }),
});

/**
 * `businessPhone` is the person's own number and is never filled from the company's office number —
 * they are on two different documents, so no fallback is even reachable.
 */
const toNewUser = (input: RegisterBody, passwordHash: string): NewUser => ({
  email: input.email,
  passwordHash,
  firstName: input.firstName,
  lastName: input.lastName,
  specialties: [input.specialty],
  location: { city: input.city, region: input.region },
  ...(input.specialtyOther === undefined ? {} : { specialtyOther: input.specialtyOther }),
  ...(input.businessPhone === undefined ? {} : { businessPhone: input.businessPhone }),
});

/**
 * Public Register onboards somebody who runs their own business, so the relationship it opens is an
 * active owner one. `companyPosition` is left unset: the screen does not ask, and a position would
 * grant nothing anyway.
 */
const toOwnerMembership = (
  user: Types.ObjectId,
  company: Types.ObjectId,
): NewCompanyMembership => ({
  company,
  user,
  standing: 'owner',
  status: 'active',
  permissions: OWNER_DEFAULT_PERMISSIONS,
});

export const createRegistrationService = ({
  users,
  companies,
  memberships,
  passwords,
  tokenPair,
  transactions,
}: RegistrationDependencies): RegistrationService => ({
  /**
   * Three documents, one transaction: the company, the person, and the owner relationship between
   * them all commit together or none of them exists. There is no state in which an account is half
   * created — no orphan company, and no user who belongs to nothing.
   *
   * The duplicate check and the bcrypt hash run *before* the transaction opens. Hashing is a
   * quarter-second of CPU, and holding a transaction open across it would widen the window for
   * write conflicts to no purpose. Tokens are issued *after* it commits, so a session can never be
   * handed out for a user that was rolled back.
   */
  async register(input) {
    if (await users.existsByEmail(input.email)) throw emailAlreadyRegistered();

    const passwordHash = await passwords.hash(input.password);

    try {
      const user = await transactions.run(async (session): Promise<UserRecord> => {
        const company = await companies.create(toNewCompany(input), session);
        const created = await users.create(toNewUser(input, passwordHash), session);

        await memberships.create(toOwnerMembership(created._id, company), session);
        return created;
      });

      const tokens = await tokenPair.issue(user._id.toString());
      return { ...tokens, user: toAuthenticatedUser(user) };
    } catch (error) {
      throw isDuplicateEmailError(error) ? emailAlreadyRegistered() : error;
    }
  },
});
