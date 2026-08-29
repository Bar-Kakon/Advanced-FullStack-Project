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

/** The organizational job. Descriptive: it is one of the values an invitation is matched on, and
 *  it grants nothing — capabilities come only from the permission model. */
export const COMPANY_POSITIONS = [
  'main_contractor', 'construction_manager', 'regional_construction_manager',
  'site_manager', 'contractor', 'employee',
] as const;
export type CompanyPosition = (typeof COMPANY_POSITIONS)[number];

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
  /** Either way: an owner names the business they are creating, an employee names the one that
   *  invited them — and for an employee the server matches it against a seat, never trusts it. */
  readonly companyName: string;
  /** Employee only. Part of what identifies the seat being claimed. */
  readonly companyPosition?: CompanyPosition;
  readonly email: string;
  readonly password: string;
  /** Validated by the server and never stored. Required, so it is always sent. */
  readonly confirmPassword: string;
  readonly specialty: Trade;
  /** Required exactly when `specialty` is `other`, and refused otherwise. */
  readonly specialtyOther?: string;
  readonly city: string;
  readonly region: Region;
  /** Belongs to the business, so only an owner registration may carry it. */
  readonly officePhone?: string;
  /** Belongs to the person. Independent of `officePhone`, with no fallback either way. */
  readonly businessPhone?: string;
  /** The organization's, so only an owner registration may carry it. */
  readonly availability?: Availability;
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

/**
 * The life of one company relationship, in order, mirrored from `companyMembership.model.ts`:
 *
 *   invited                    the company opened a seat. NO account has claimed it.
 *   pending_company_approval   somebody claimed that seat by registering.
 *   active                     the company approved them.
 *   inactive                   the relationship ended.
 *
 * These are codes, never labels. A reader is shown `t.employees.status`, which holds the one
 * sentence each of them is given in each language.
 */
export const COMPANY_MEMBERSHIP_STATUSES = [
  'invited', 'pending_company_approval', 'active', 'inactive',
] as const;
export type CompanyMembershipStatus = (typeof COMPANY_MEMBERSHIP_STATUSES)[number];

/**
 * One row of `GET /companies/employees`, mirrored from `employeeManagement.controller.ts`.
 *
 * `invitedFullName` and `companyPosition` are nullable because the controller answers `null` for a
 * row that never carried one — the owner's own membership is written by Register, which asks for
 * neither. `userId` is `null` until a seat is claimed, and that absence is the point: an
 * invitation exists before an account does, so there is no person here whose email or phone the
 * screen could reach for. The type gives it nothing to invent them from.
 */
export interface EmployeeMembership {
  readonly id: string;
  readonly status: CompanyMembershipStatus;
  readonly standing: CompanyStanding;
  readonly invitedFullName: string | null;
  readonly companyPosition: CompanyPosition | null;
  readonly userId: string | null;
}

/** Every relationship in the caller's company, oldest first. The owner's own row is among them. */
export interface EmployeeListResponse {
  readonly memberships: readonly EmployeeMembership[];
}

/**
 * `POST /companies/employees/invitations`, mirrored from `createInvitationBodySchema`. Two fields,
 * and deliberately only two: opening a seat asks nothing about the person's account, because the
 * person supplies all of that themselves when they register against it.
 */
export interface CreateInvitationPayload {
  readonly fullName: string;
  readonly companyPosition: CompanyPosition;
}

/** A 201 names the row that now exists. The list is re-read rather than patched from this. */
export interface CreateInvitationResponse {
  readonly invitationId: string;
}

/** Both approval endpoints answer with how many relationships actually moved to `active`. */
export interface ApprovalResponse {
  readonly approved: number;
}
