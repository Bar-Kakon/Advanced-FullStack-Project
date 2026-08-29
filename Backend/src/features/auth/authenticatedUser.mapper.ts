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
 * The same person, plus the company relationship they are currently living in. It is a separate
 * shape rather than two more keys on `AuthenticatedUser` because only a *session* has an answer:
 * Register creates an account and opens no session, so its 201 keeps the plain identity and does
 * not have to describe a company nobody has signed in to yet.
 *
 * `company` is `null` for somebody who holds no relationship at all. That is not the same as
 * holding one that has not been approved — see `CompanyContext.membershipStatus`.
 */
export interface SessionUser extends AuthenticatedUser {
  readonly company: CompanyContext | null;
}

export const toSessionUser = (user: UserRecord, company: CompanyContext | null): SessionUser => ({
  ...toAuthenticatedUser(user),
  company,
});
