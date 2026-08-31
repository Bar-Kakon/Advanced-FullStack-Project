import type { CompanyContext } from '../companies/companyContext.service.js';
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

/**
 * The person plus their company relationship. Separate from `AuthenticatedUser` because only a
 * session has the second half: Register opens none, so its 201 keeps the plain identity.
 */
export interface SessionUser extends AuthenticatedUser {
  readonly company: CompanyContext | null;
  /**
   * The viewer's own platform role, and only ever their own. It is here so the client can decide
   * whether to draw a moderation entry point at all — a route guard, never the authorization: the
   * moderation API reads `isAdmin` from the account on every request regardless of what is sent.
   *
   * Register does not carry it: `AuthenticatedUser` has no such field, and a new account is never
   * an admin.
   */
  readonly isAdmin: boolean;
}

export const toSessionUser = (user: UserRecord, company: CompanyContext | null): SessionUser => ({
  ...toAuthenticatedUser(user),
  company,
  isAdmin: user.isAdmin === true,
});
