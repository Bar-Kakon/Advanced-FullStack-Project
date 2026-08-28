import type { Types } from 'mongoose';

import type { CompanyRepository, NewCompany } from '../companies/company.repository.js';
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

export interface RegistrationDependencies {
  readonly users: UserRepository;
  readonly companies: CompanyRepository;
  readonly passwords: PasswordService;
  readonly tokenPair: TokenPairService;
}

const DUPLICATE_KEY_CODE = 11000;

interface DuplicateKeyError {
  readonly code?: unknown;
  readonly keyPattern?: Record<string, unknown>;
}

/**
 * The unique index is the real guarantee, so the race the pre-check cannot close surfaces here as a
 * driver error. Recognising it keeps the raw MongoDB failure off the wire and answers the same
 * `EMAIL_ALREADY_REGISTERED` the pre-check does.
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
 * The registrant owns the business they just named, because no invitation flow exists yet for
 * joining an existing one. `businessPhone` is the person's own number and is never filled from the
 * company's office number — they are on two different documents, so no fallback is even reachable.
 */
const toNewUser = (
  input: RegisterBody,
  passwordHash: string,
  company: Types.ObjectId,
): NewUser => ({
  email: input.email,
  passwordHash,
  firstName: input.firstName,
  lastName: input.lastName,
  company,
  companyStanding: 'owner',
  companyMembershipStatus: 'active',
  specialties: [input.specialty],
  location: { city: input.city, region: input.region },
  ...(input.specialtyOther === undefined ? {} : { specialtyOther: input.specialtyOther }),
  ...(input.businessPhone === undefined ? {} : { businessPhone: input.businessPhone }),
});

export const createRegistrationService = ({
  users,
  companies,
  passwords,
  tokenPair,
}: RegistrationDependencies): RegistrationService => ({
  /**
   * Two documents, no transaction — a standalone mongod has none, and the README's dev setup is
   * one. The email is checked first so the ordinary duplicate never creates anything, and the
   * company created by *this* attempt is deleted if the user write loses the race. No pre-existing
   * company is ever touched.
   */
  async register(input) {
    if (await users.existsByEmail(input.email)) throw emailAlreadyRegistered();

    const passwordHash = await passwords.hash(input.password);
    const company = await companies.create(toNewCompany(input));

    try {
      const user = await users.create(toNewUser(input, passwordHash, company));
      const tokens = await tokenPair.issue(user._id.toString());

      return { ...tokens, user: toAuthenticatedUser(user) };
    } catch (error) {
      await companies.deleteById(company);
      throw isDuplicateEmailError(error) ? emailAlreadyRegistered() : error;
    }
  },
});
