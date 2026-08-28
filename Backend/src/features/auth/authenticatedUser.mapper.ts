import type { UserLanguage, UserRecord } from '../users/user.model.js';

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly language: UserLanguage;
  readonly profileComplete: boolean;
}

/**
 * The only shape of a user this feature puts on the wire. It reads `UserRecord`, whose type carries
 * no `passwordHash` at all, so leaking the hash is not something a future edit here can do by
 * accident — it would not compile.
 *
 * `language` is included because §3.4 makes `users.language` the account-level preference and
 * demotes `localStorage` to a pre-login default; the client cannot honour that without being told.
 * `profileComplete` drives the profile-incomplete nag the schema document describes.
 */
export const toAuthenticatedUser = (user: UserRecord): AuthenticatedUser => ({
  id: user._id.toString(),
  email: user.email,
  firstName: user.firstName,
  lastName: user.lastName,
  language: user.language,
  profileComplete: user.profileComplete,
});
