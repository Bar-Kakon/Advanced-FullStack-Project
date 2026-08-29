/**
 * The Register wire contract, mirrored from `Backend/src/features/auth/auth.validation.ts`.
 *
 * The optional fields are marked `?` rather than `| undefined` on purpose, and `tsconfig` sets
 * `exactOptionalPropertyTypes`. Together that makes "absent" and "present but undefined" different
 * types, which is exactly the distinction this endpoint cares about: `officePhone` is
 * `Joi.string()`, and Joi rejects an empty string, so a phone the user left blank has to be
 * *missing from the object*, not sent as `''`.
 */

export const TRADES = [
  'general', 'electrical', 'plumbing', 'drilling', 'shell', 'concrete', 'saferoom',
  'carpentry', 'aluminum', 'hvac', 'painting', 'tiling', 'plastering', 'earthworks',
  'waterproofing', 'supply', 'development', 'doors', 'sandpumps', 'haulage_crane',
  'concrete_cutting', 'heavy_equipment', 'other',
] as const;

export const REGIONS = [
  'nationwide', 'north', 'haifa', 'sharon', 'center', 'telaviv', 'jerusalem', 'lowlands', 'south',
] as const;

export const AVAILABILITY_STATUSES = ['open', 'limited', 'closed'] as const;

export type Trade = (typeof TRADES)[number];
export type Region = (typeof REGIONS)[number];
export type Availability = (typeof AVAILABILITY_STATUSES)[number];

/** Organizational standing only — not a permission, not a project role, not a job title. */
export const COMPANY_STANDINGS = ['owner', 'employee'] as const;
export type CompanyStanding = (typeof COMPANY_STANDINGS)[number];

export interface RegisterPayload {
  readonly firstName: string;
  readonly lastName: string;
  /**
   * Sent explicitly rather than left to the server's default, so the field this screen means is
   * the field the server records. Public Register has one control today and it creates an owner;
   * the employee path exists on the endpoint but has no screen, because an employee has no company
   * to be linked to until an invitation flow exists.
   */
  readonly standing: CompanyStanding;
  readonly companyName: string;
  readonly email: string;
  readonly password: string;
  /** Validated by the server and never stored. Required, so it is always sent. */
  readonly confirmPassword: string;
  readonly specialty: Trade;
  /** Required exactly when `specialty` is `other`, and refused otherwise. */
  readonly specialtyOther?: string;
  readonly city: string;
  readonly region: Region;
  /** Belongs to the business. Independent of `businessPhone`, with no fallback either way. */
  readonly officePhone?: string;
  /** Belongs to the person. Independent of `officePhone`, with no fallback either way. */
  readonly businessPhone?: string;
  readonly availability: Availability;
  /** The server only accepts `true`, and records the consent against its own Terms version. */
  readonly acceptedTerms: true;
}

/**
 * The Login wire contract, mirrored from `loginBodySchema` in the same backend file.
 *
 * It checks that a credential was *submitted*, never that it is well-formed enough to be a
 * plausible password — Register owns the password policy, and applying it here would tell an
 * attacker which passwords could never belong to an account.
 */
export interface LoginPayload {
  readonly email: string;
  readonly password: string;
}

/** The only user shape the API puts on the wire. It carries no password hash by construction. */
export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly language: 'he' | 'en';
  readonly profileComplete: boolean;
}

/**
 * What the client reads back from a successful registration: the account that now exists, and
 * nothing else.
 *
 * `accessToken` is deliberately absent. Register creates an account; Login is the authentication
 * boundary, and signing up must not leave the client holding a session. The server has not caught
 * up — its 201 still carries an `accessToken` and still sets a Refresh cookie — but this type is
 * what the client will read, so no code here can consume a credential it must not have.
 */
export interface RegisterResponse {
  readonly user: AuthenticatedUser;
}

/**
 * A 200 from Login carries the Access Token in the body and rotates the Refresh Token in a
 * `Set-Cookie` header, so the Refresh Token is deliberately absent from this type — it is
 * HttpOnly and never visible to this code at all.
 */
export interface LoginResponse {
  readonly accessToken: string;
  readonly user: AuthenticatedUser;
}

/** `POST /api/auth/forgot-password`. The answer never differs by whether the address exists. */
export interface ForgotPasswordPayload {
  readonly email: string;
}

/**
 * `POST /api/auth/reset-password`. `token` is the raw value from the emailed link; the server
 * holds only its hash. No `confirmPassword` — the match is a courtesy to the person typing, and
 * the server applies the password rules itself either way.
 */
export interface ResetPasswordPayload {
  readonly token: string;
  readonly password: string;
}

/** Both password-reset endpoints answer the same generic shape on success. */
export interface StatusResponse {
  readonly status: string;
}

/** Every deliberate failure the API raises answers this shape. */
export interface ApiErrorBody {
  readonly code: string;
  readonly message: string;
}
