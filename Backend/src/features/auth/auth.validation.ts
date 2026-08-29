import Joi from 'joi';

import { AVAILABILITY_STATUSES, type Availability } from '../companies/company.model.js';
import {
  COMPANY_POSITIONS,
  COMPANY_STANDINGS,
  type CompanyPosition,
  type CompanyStanding,
} from '../companies/companyMembership.model.js';
import { REGIONS, TRADES, type Region, type Trade } from '../users/user.model.js';

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
  readonly specialty: Trade;
  readonly specialtyOther?: string;
  readonly city: string;
  readonly region: Region;
  readonly officePhone?: string;
  readonly businessPhone?: string;
  readonly availability?: Availability;
  readonly acceptedTerms: true;
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

  // Defaults to `owner`, which is what public Register has always created, so a client that does
  // not send it is unchanged.
  standing: Joi.string()
    .valid(...COMPANY_STANDINGS)
    .default('owner'),

  /*
   * The three company-scoped fields are required for an owner and REFUSED for an employee — the
   * same `when` idiom `specialtyOther` already uses. Refusing rather than ignoring is the security
   * property: a public company name is not proof of employment, so the endpoint must not be able
   * to receive one on a path that could act on it.
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

  specialty: Joi.string()
    .valid(...TRADES)
    .required(),
  // Required exactly when the trade is `other`, and refused otherwise, so the enum and the free
  // text can never describe two different things.
  specialtyOther: Joi.when('specialty', {
    is: 'other',
    then: Joi.string().trim().min(1).max(MAX_SPECIALTY_OTHER_LENGTH).required(),
    otherwise: Joi.any().forbidden(),
  }),

  city: Joi.string().trim().min(1).max(MAX_CITY_LENGTH).required(),
  region: Joi.string()
    .valid(...REGIONS)
    .required(),

  // Two independent numbers. Neither is required by the other's presence and neither has a format
  // rule, because none has been approved. The office line belongs to the business, so an employee
  // registration cannot carry one.
  officePhone: Joi.when('standing', {
    is: 'employee',
    then: Joi.any().forbidden(),
    otherwise: Joi.string().trim().max(MAX_PHONE_LENGTH).optional(),
  }),
  businessPhone: Joi.string().trim().max(MAX_PHONE_LENGTH).optional(),

  // Availability is the organization's, set by whoever runs it, so it is an owner-only field.
  availability: Joi.when('standing', {
    is: 'employee',
    then: Joi.any().forbidden(),
    otherwise: Joi.string()
      .valid(...AVAILABILITY_STATUSES)
      .default('open'),
  }),

  acceptedTerms: Joi.boolean().valid(true).required(),
});
