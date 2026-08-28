import Joi from 'joi';

import { AVAILABILITY_STATUSES, type Availability } from '../companies/company.model.js';
import { REGIONS, TRADES, type Region, type Trade } from '../users/user.model.js';

export interface LoginBody {
  readonly email: string;
  readonly password: string;
}

export interface RegisterBody {
  readonly firstName: string;
  readonly lastName: string;
  readonly companyName: string;
  readonly email: string;
  readonly password: string;
  readonly confirmPassword: string;
  readonly specialty: Trade;
  readonly specialtyOther?: string;
  readonly city: string;
  readonly region: Region;
  readonly officePhone?: string;
  readonly businessPhone?: string;
  readonly availability: Availability;
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
  companyName: Joi.string().trim().min(1).max(MAX_COMPANY_NAME_LENGTH).required(),

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
  // rule, because none has been approved.
  officePhone: Joi.string().trim().max(MAX_PHONE_LENGTH).optional(),
  businessPhone: Joi.string().trim().max(MAX_PHONE_LENGTH).optional(),

  availability: Joi.string()
    .valid(...AVAILABILITY_STATUSES)
    .default('open'),

  acceptedTerms: Joi.boolean().valid(true).required(),
});
