import Joi from 'joi';

import { structuredPlaceSchema, type StructuredPlaceBody } from '../location/place.validation.js';

import { AVAILABILITY_STATUSES, type Availability } from '../companies/company.model.js';
import {
  COMPANY_POSITIONS,
  COMPANY_STANDINGS,
  type CompanyPosition,
  type CompanyStanding,
} from '../companies/companyMembership.model.js';
import {
  DRILLING_SPECIALTY,
  DRILLING_TYPES,
  OTHER_SPECIALTIES,
  REGIONS,
  REGISTRATION_CATEGORIES,
  SPECIALTIES_BY_CATEGORY,
  type DrillingType,
  type Region,
  type RegistrationCategory,
  type Specialty,
} from '../users/user.model.js';

export interface LoginBody {
  readonly email: string;
  readonly password: string;
}

export interface ForgotPasswordBody {
  readonly email: string;
}

export interface ResetPasswordBody {
  readonly token: string;
  readonly password: string;
}

export interface RegisterBody {
  readonly firstName: string;
  readonly lastName: string;
  /** Organizational standing, and nothing else. It is not a permission and not a job title. */
  readonly standing: CompanyStanding;
  /** Required either way: an owner names the business they are creating, an employee names the
   *  one that invited them — and for the employee it is matched, never trusted. */
  readonly companyName: string;
  /** Employee only. Part of what identifies the seat being claimed. */
  readonly companyPosition?: CompanyPosition;
  readonly email: string;
  readonly password: string;
  readonly confirmPassword: string;
  /** Step 1's first choice. It decides which taxonomy `specialty` is read against. */
  readonly registrationCategory: RegistrationCategory;
  readonly specialty: Specialty;
  readonly specialtyOther?: string;
  /** Contractor drilling only. */
  readonly drillingTypes?: readonly DrillingType[];
  readonly city: string;
  readonly region: Region;
  readonly officePhone?: string;
  readonly businessPhone?: string;
  /** Optional: the structured place behind `city`, when the browser resolved one. */
  readonly place?: StructuredPlaceBody;
  readonly availability?: Availability;
  readonly acceptedTerms: true;
  /** Step 2. Required with no default, so neither answer can be assumed from silence. */
  readonly operationalEmail: boolean;
}

const MAX_EMAIL_LENGTH = 254;
/** A shape guard, not a password policy: bcrypt on an unbounded string is a cheap way to burn CPU. */
const MAX_PASSWORD_LENGTH = 200;
const MIN_PASSWORD_LENGTH = 8;
const MAX_NAME_LENGTH = 100;
const MAX_COMPANY_NAME_LENGTH = 120;
const MAX_CITY_LENGTH = 80;
const MAX_SPECIALTY_OTHER_LENGTH = 60;
/** A bound, not a format. What counts as a valid number here has never been approved — see D27. */
const MAX_PHONE_LENGTH = 30;
/** The issued token is 64 hex characters; the bound is slack, not a format check. */
const MAX_RESET_TOKEN_LENGTH = 200;

const email = Joi.string().trim().lowercase().email().max(MAX_EMAIL_LENGTH).required();

/**
 * Login checks that a credential was *submitted*, never that it is well-formed enough to be a
 * plausible password. Register owns the password policy; applying it here would tell an attacker
 * which passwords could never belong to an account.
 */
export const loginBodySchema = Joi.object<LoginBody>({
  email,
  password: Joi.string().min(1).max(MAX_PASSWORD_LENGTH).required(),
});

export const forgotPasswordBodySchema = Joi.object<ForgotPasswordBody>({ email });

/**
 * `token` is bounded but not shape-checked. A malformed token and a wrong one are the same event
 * to the person holding a dead link, so both take the INVALID_RESET_TOKEN path rather than one
 * answering 400 and the other 401. The password rules are Register's, applied independently of
 * anything the client checked.
 */
export const resetPasswordBodySchema = Joi.object<ResetPasswordBody>({
  token: Joi.string().trim().min(1).max(MAX_RESET_TOKEN_LENGTH).required(),
  password: Joi.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH).required(),
});

/**
 * The whole Register contract, in one place. `validateRequest` strips unknown keys, so a body that
 * also carries `status`, `isAdmin` or `passwordHash` loses them here rather than downstream.
 *
 * `confirmPassword` is validated and never persisted — `toNewUser` names the fields it writes, so
 * it cannot travel any further than this boundary. `acceptedTerms` is enforced the same way and is
 * likewise not stored: D25 has not settled whether the documents it refers to will exist.
 */
export const registerBodySchema = Joi.object<RegisterBody>({
  firstName: Joi.string().trim().min(1).max(MAX_NAME_LENGTH).required(),
  lastName: Joi.string().trim().min(1).max(MAX_NAME_LENGTH).required(),

  // Required, and deliberately not defaulted. It decides which of two registrations this is, and a
  // request that does not say should be answered rather than guessed at.
  standing: Joi.string()
    .valid(...COMPANY_STANDINGS)
    .required(),

  /*
   * Required on both paths, and it means two different things. An owner names the business they
   * are creating. An employee names the one that invited them — and it is MATCHED, never trusted:
   * on its own it proves nothing, it only narrows the search for a seat somebody already opened.
   */
  companyName: Joi.string().trim().min(1).max(MAX_COMPANY_NAME_LENGTH).required(),

  // The employee's job, and one of the three values their invitation is matched on. It describes
  // the role and grants nothing: capabilities come only from `permissions`.
  companyPosition: Joi.when('standing', {
    is: 'employee',
    then: Joi.string()
      .valid(...COMPANY_POSITIONS)
      .required(),
    otherwise: Joi.any().forbidden(),
  }),

  email,
  password: Joi.string().min(MIN_PASSWORD_LENGTH).max(MAX_PASSWORD_LENGTH).required(),
  confirmPassword: Joi.string()
    .required()
    .valid(Joi.ref('password'))
    .messages({ 'any.only': 'confirmPassword must match password' }),

  // Asked first in Step 1, because it decides which list the next field is read against.
  registrationCategory: Joi.string()
    .valid(...REGISTRATION_CATEGORIES)
    .required(),

  // Each route accepts only its own taxonomy, so a supplier cannot register as an electrician.
  specialty: Joi.when('registrationCategory', {
    switch: REGISTRATION_CATEGORIES.map((category) => ({
      is: category,
      then: Joi.string()
        .valid(...SPECIALTIES_BY_CATEGORY[category])
        .required(),
    })),
    otherwise: Joi.any().forbidden(),
  }),

  // Required exactly when the specialty is the route's own `other` code, and refused otherwise, so
  // the enum and the free text can never describe two different things.
  specialtyOther: Joi.when('specialty', {
    is: Joi.string()
      .valid(...OTHER_SPECIALTIES)
      .required(),
    then: Joi.string().trim().min(1).max(MAX_SPECIALTY_OTHER_LENGTH).required(),
    otherwise: Joi.any().forbidden(),
  }),

  // The nested drilling subtype. Refused on every other specialty, the way `heavyEquipment` is.
  drillingTypes: Joi.when('specialty', {
    is: DRILLING_SPECIALTY,
    then: Joi.array()
      .items(Joi.string().valid(...DRILLING_TYPES))
      .unique()
      .optional(),
    otherwise: Joi.any().forbidden(),
  }),

  city: Joi.string().trim().min(1).max(MAX_CITY_LENGTH).required(),
  region: Joi.string()
    .valid(...REGIONS)
    .required(),

  /*
   * Two independent numbers. Neither is required by the other's presence and neither has a format
   * rule, because none has been approved.
   *
   * `officePhone` is refused on the employee path because D27 puts it on the COMPANY document, and
   * an employee registration writes no company: the field would have nowhere to go. Accepting and
   * discarding it is what `specialtyOther`'s `forbidden()` exists to avoid, and writing it to the
   * employer's company would let somebody not yet approved edit that company's record. Which of
   * those an employee may do is a decision nobody has taken, so the field is refused rather than
   * guessed at. `businessPhone` is the person's own and is collected on both paths.
   */
  officePhone: Joi.when('standing', {
    is: 'employee',
    then: Joi.any().forbidden(),
    otherwise: Joi.string().trim().max(MAX_PHONE_LENGTH).optional(),
  }),
  businessPhone: Joi.string().trim().max(MAX_PHONE_LENGTH).optional(),
  place: structuredPlaceSchema.optional(),

  /*
   * D14, closed: availability is the ORGANIZATION's work availability, "controlled by the
   * execution contractor / company owner", with "deliberately no per-user copy and no per-user
   * override", and it "must not be reinterpreted as the personal availability of each employee".
   * An employee supplying one at registration is exactly that reinterpretation, so it is refused.
   */
  availability: Joi.when('standing', {
    is: 'employee',
    then: Joi.any().forbidden(),
    otherwise: Joi.string()
      .valid(...AVAILABILITY_STATUSES)
      .default('open'),
  }),

  acceptedTerms: Joi.boolean().valid(true).required(),

  // Step 2. Required with no default: the person must actively choose, and either answer is valid.
  operationalEmail: Joi.boolean().required(),
});
