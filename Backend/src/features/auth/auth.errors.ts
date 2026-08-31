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

/** No OAuth client is configured, so this deployment cannot verify a Google credential at all. */
export const googleAuthNotConfigured = (): AppError =>
  new AppError('Google sign-in is not configured', 503, 'GOOGLE_AUTH_NOT_CONFIGURED');

/** One answer for forged, expired, wrong-audience and malformed credentials alike. */
export const invalidGoogleCredential = (): AppError =>
  new AppError('Google credential is not usable', 401, 'INVALID_GOOGLE_CREDENTIAL');

/**
 * Google itself reports the address as unconfirmed, so it proves nothing about who holds the
 * mailbox and cannot be used to reach an account.
 */
export const googleEmailNotVerified = (): AppError =>
  new AppError('Google has not verified this email address', 401, 'GOOGLE_EMAIL_NOT_VERIFIED');

/**
 * The verified Google email already belongs to a FieldSync account carrying no Google link.
 *
 * Linking on the strength of that match alone would be unsafe: registration never proves the
 * person controls the address they typed, so an account opened under somebody else's email would
 * capture that person's first Google sign-in. The owner signs in with their password and links
 * Google deliberately instead.
 */
export const googleLinkRequired = (): AppError =>
  new AppError('Sign in with your password to link Google', 409, 'GOOGLE_LINK_REQUIRED');

/** This account already holds a Google link, so a second would overwrite the first. */
export const googleAlreadyLinked = (): AppError =>
  new AppError('This account is already linked to Google', 409, 'GOOGLE_ALREADY_LINKED');

/** The Google identity is linked to a different account. One subject resolves to one account. */
export const googleIdentityClaimed = (): AppError =>
  new AppError('This Google account is linked elsewhere', 409, 'GOOGLE_IDENTITY_CLAIMED');

/** Registration opens the account for the address Google verified, never for another one. */
export const googleEmailMismatch = (): AppError =>
  new AppError('The email does not match the Google account', 409, 'GOOGLE_EMAIL_MISMATCH');
