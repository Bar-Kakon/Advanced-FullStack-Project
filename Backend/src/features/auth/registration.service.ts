import type { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import {
  OWNER_COMPANY_POSITION,
  OWNER_DEFAULT_PERMISSIONS,
} from '../companies/companyMembership.model.js';
import type {
  CompanyMembershipRepository,
  NewCompanyMembership,
} from '../companies/companyMembership.repository.js';
import type { Availability } from '../companies/company.model.js';
import type { CompanyPosition } from '../companies/companyMembership.model.js';
import type { CompanyRepository, NewCompany } from '../companies/company.repository.js';
import type { UserRecord } from '../users/user.model.js';
import type { NewUser, UserRepository } from '../users/user.repository.js';
import { emailAlreadyRegistered, invitationAmbiguous, invitationNotFound } from './auth.errors.js';
import type { RegisterBody } from './auth.validation.js';

/** What the schema guarantees once `standing` is `owner`: the owner-only fields are present. */
type OwnerRegisterBody = RegisterBody & { readonly availability: Availability };

/** And once it is `employee`: the two values their invitation is matched on. */
type EmployeeRegisterBody = RegisterBody & { readonly companyPosition: CompanyPosition };
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
  registrationCategory: input.registrationCategory,
  specialties: [input.specialty],
  notificationPreferences: { operationalEmail: input.operationalEmail },
  location: {
    city: input.city,
    region: input.region,
    ...(input.place === undefined ? {} : { place: input.place }),
  },
  termsAcceptances: [{ version: termsVersion, acceptedAt: new Date() }],
  ...(input.specialtyOther === undefined ? {} : { specialtyOther: input.specialtyOther }),
  ...(input.drillingTypes === undefined ? {} : { drillingTypes: input.drillingTypes }),
  ...(input.businessPhone === undefined ? {} : { businessPhone: input.businessPhone }),
});

/**
 * Public Register onboards somebody who runs their own business, so the relationship it opens is an
 * active owner one, holding the Main Contractor job of the company it just created.
 */
const toOwnerMembership = (
  user: Types.ObjectId,
  company: Types.ObjectId,
): NewCompanyMembership => ({
  company,
  user,
  standing: 'owner',
  status: 'active',
  companyPosition: OWNER_COMPANY_POSITION,
  permissions: OWNER_DEFAULT_PERMISSIONS,
});

const isOwnerRegistration = (input: RegisterBody): input is OwnerRegisterBody =>
  input.standing === 'owner';

/** The person's own name, as the owner would have typed it when opening the seat. */
const fullNameOf = (input: RegisterBody): string => `${input.firstName} ${input.lastName}`;

export const createRegistrationService = ({
  users,
  companies,
  memberships,
  passwords,
  transactions,
  termsVersion,
}: RegistrationDependencies): RegistrationService => {
  /**
   * The approved matching model: an open seat, in a company holding that name, opened for that
   * person under that job title. Company names are deliberately not unique, so every company of
   * that name is searched and an ambiguous result is refused rather than guessed at.
   */
  const findInvitationFor = async (input: EmployeeRegisterBody): Promise<Types.ObjectId> => {
    const companyIds = await companies.findIdsByName(input.companyName);
    if (companyIds.length === 0) throw invitationNotFound();

    const matches = await memberships.findOpenInvitations({
      companyIds,
      invitedFullName: fullNameOf(input),
      companyPosition: input.companyPosition,
    });

    if (matches.length === 0) throw invitationNotFound();
    if (matches.length > 1) throw invitationAmbiguous();

    return matches[0]!._id;
  };

  return {
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

    /*
     * An employee claims a seat their employer already opened. The match is made BEFORE the
     * transaction, so a registration with no invitation writes nothing at all — and the company
     * name is only ever used to find candidate seats, never as evidence on its own.
     */
    const invitation = isOwnerRegistration(input)
      ? null
      : await findInvitationFor(input as EmployeeRegisterBody);

    try {
      const user = await transactions.run(async (session): Promise<UserRecord> => {
        const created = await users.create(
          toNewUser(input, passwordHash, termsVersion),
          session,
        );

        if (invitation !== null) {
          // The claim is conditional on the seat still being open, so it also commits or rolls
          // back with the account: there is no state where a user exists holding nothing.
          const claimed = await memberships.claimInvitation(invitation, created._id, session);
          if (!claimed) throw invitationNotFound();
          return created;
        }

        const company = await companies.create(toNewCompany(input as OwnerRegisterBody), session);
        await memberships.create(toOwnerMembership(created._id, company), session);
        return created;
      });

      return { user: toAuthenticatedUser(user) };
    } catch (error) {
      throw isDuplicateEmailError(error) ? emailAlreadyRegistered() : error;
    }
    },
  };
};
