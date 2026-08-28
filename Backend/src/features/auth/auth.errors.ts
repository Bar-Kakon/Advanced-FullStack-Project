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
