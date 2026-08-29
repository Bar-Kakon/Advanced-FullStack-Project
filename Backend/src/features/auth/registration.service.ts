import type { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import { OWNER_DEFAULT_PERMISSIONS } from '../companies/companyMembership.model.js';
import type {
  CompanyMembershipRepository,
  NewCompanyMembership,
} from '../companies/companyMembership.repository.js';
import type { Availability } from '../companies/company.model.js';
import type { CompanyRepository, NewCompany } from '../companies/company.repository.js';
import type { UserRecord } from '../users/user.model.js';
import type { NewUser, UserRepository } from '../users/user.repository.js';
import { emailAlreadyRegistered } from './auth.errors.js';
import type { RegisterBody } from './auth.validation.js';

/** What the schema guarantees once `standing` is `owner`: the company-scoped fields are present. */
type OwnerRegisterBody = RegisterBody & { readonly companyName: string; readonly availability: Availability };
import { toAuthenticatedUser, type AuthenticatedUser } from './authenticatedUser.mapper.js';
import type { PasswordService } from './password.service.js';

/** No tokens. Register creates an account; Login is the only thing that opens a session. */
export interface RegistrationResult {
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
  readonly transactions: TransactionRunner;
  /** The Terms version currently in force, from config — never taken from the request body. */
  readonly termsVersion: string;
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

/**
 * The office number belongs to the business, so it is the company document that carries it. Only
 * an owner registration reaches this — validation refuses these fields for an employee, so the
 * non-null assertions here rest on the schema rather than on hope.
 */
const toNewCompany = (input: OwnerRegisterBody): NewCompany => ({
  name: input.companyName,
  availability: input.availability,
  ...(input.officePhone === undefined ? {} : { officePhone: input.officePhone }),
});

/**
 * `businessPhone` is the person's own number and is never filled from the company's office number —
 * they are on two different documents, so no fallback is even reachable.
 *
 * The consent is recorded rather than discarded: validation already proved `acceptedTerms` was
 * `true`, and the version plus the timestamp are what make that provable after the Terms change.
 * The boolean itself is not stored — it carries no information the dated record does not.
 */
const toNewUser = (input: RegisterBody, passwordHash: string, termsVersion: string): NewUser => ({
  email: input.email,
  passwordHash,
  firstName: input.firstName,
  lastName: input.lastName,
  specialties: [input.specialty],
  location: { city: input.city, region: input.region },
  termsAcceptances: [{ version: termsVersion, acceptedAt: new Date() }],
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

const isOwnerRegistration = (input: RegisterBody): input is OwnerRegisterBody =>
  input.standing === 'owner';

export const createRegistrationService = ({
  users,
  companies,
  memberships,
  passwords,
  transactions,
  termsVersion,
}: RegistrationDependencies): RegistrationService => ({
  /**
   * Three documents, one transaction: the company, the person, and the owner relationship between
   * them all commit together or none of them exists. There is no state in which an account is half
   * created — no orphan company, and no user who belongs to nothing.
   *
   * The duplicate check and the bcrypt hash run *before* the transaction opens. Hashing is a
   * quarter-second of CPU, and holding a transaction open across it would widen the window for
   * write conflicts to no purpose.
   */
  async register(input) {
    if (await users.existsByEmail(input.email)) throw emailAlreadyRegistered();

    const passwordHash = await passwords.hash(input.password);

    try {
      const user = await transactions.run(async (session): Promise<UserRecord> => {
        const created = await users.create(
          toNewUser(input, passwordHash, termsVersion),
          session,
        );

        /*
         * An employee registration stops at the person. It creates no company and no membership,
         * because there is nothing here that could prove which company they belong to — a company
         * name is public, so accepting one as evidence would hand anybody a seat in any business.
         * The approved path is an owner opening an `invited` seat that a registration then claims,
         * and no endpoint creates one yet. That gap is reported rather than filled from here.
         */
        if (!isOwnerRegistration(input)) return created;

        const company = await companies.create(toNewCompany(input), session);
        await memberships.create(toOwnerMembership(created._id, company), session);
        return created;
      });

      return { user: toAuthenticatedUser(user) };
    } catch (error) {
      throw isDuplicateEmailError(error) ? emailAlreadyRegistered() : error;
    }
  },
});
