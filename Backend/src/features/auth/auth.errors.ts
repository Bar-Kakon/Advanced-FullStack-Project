import { AppError } from '../../shared/errors.js';

/**
 * Every authentication failure the API raises deliberately, in one place. The client renders the
 * `code`; the `message` is a neutral fallback and never names which half of the input was wrong.
 */

/** One answer for "no such account" and "wrong password" alike — anti-enumeration, per §3.4. */
export const invalidCredentials = (): AppError =>
  new AppError('Invalid credentials', 401, 'INVALID_CREDENTIALS');

/** The Access Token was missing, malformed, expired, signed elsewhere, or was not an Access Token. */
export const unauthenticated = (): AppError =>
  new AppError('Authentication required', 401, 'UNAUTHENTICATED');

/** The Refresh Token was missing, malformed, expired, unknown, already used, revoked, or not a Refresh Token. */
export const invalidRefreshToken = (): AppError =>
  new AppError('Refresh token is not usable', 401, 'INVALID_REFRESH_TOKEN');

/**
 * Employee registration only. Typing a company name is not evidence of employment, so a
 * registration that matches no open seat creates nothing — it is refused, and told so plainly,
 * because the person needs to know their employer has not invited them yet.
 */
export const invitationNotFound = (): AppError =>
  new AppError('No matching employee invitation was found', 409, 'INVITATION_NOT_FOUND');

/** More than one open seat matched. Company names are not unique, so this is possible. */
export const invitationAmbiguous = (): AppError =>
  new AppError('More than one employee invitation matched', 409, 'INVITATION_AMBIGUOUS');

/** One answer for missing, unknown, expired, superseded and already-spent reset links alike. */
export const invalidResetToken = (): AppError =>
  new AppError('Reset link is not usable', 401, 'INVALID_RESET_TOKEN');

/**
 * Register only. A signup form has to say which field to correct, and it is already an enumeration
 * surface by nature. Login and password reset keep their unified answers unchanged.
 */
export const emailAlreadyRegistered = (): AppError =>
  new AppError('Email is already registered', 409, 'EMAIL_ALREADY_REGISTERED');
