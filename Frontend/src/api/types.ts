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
 * `accessToken` is deliberately absent, and the server agrees: Register creates an account, and
 * Login is the authentication boundary.
 */
export interface RegisterResponse {
  readonly user: AuthenticatedUser;
}

/** The four capability codes, mirrored from `COMPANY_PERMISSIONS`. The list is closed on purpose. */
export const COMPANY_PERMISSIONS = [
  'project.create', 'task.create', 'company.manage', 'company.invite_employees',
] as const;
export type CompanyPermission = (typeof COMPANY_PERMISSIONS)[number];

/**
 * The caller's own company relationship, mirrored from `companyContext.service.ts`.
 * `membershipStatus` stays a code because no boolean separates waiting from having left, and
 * `permissions` is the only thing this client asks before drawing a control.
 */
export interface CompanyContext {
  readonly id: string;
  readonly standing: CompanyStanding;
  readonly membershipStatus: CompanyMembershipStatus;
  readonly permissions: readonly CompanyPermission[];
  /** Whether the business has been through employee setup, by inviting somebody or by skipping. */
  readonly employeeSetupComplete: boolean;
}

/**
 * The person plus their company relationship. Only a session has the second half, which is why
 * Register's 201 answers the plain `AuthenticatedUser`. `null` means no relationship at all.
 */
export interface SessionUser extends AuthenticatedUser {
  readonly company: CompanyContext | null;
}

/**
 * A 200 from Login carries the Access Token in the body and rotates the Refresh Token in a
 * `Set-Cookie` header, so the Refresh Token is deliberately absent from this type — it is
 * HttpOnly and never visible to this code at all.
 */
export interface LoginResponse {
  readonly accessToken: string;
  readonly user: SessionUser;
}

/** `GET /api/auth/me`. A read: it issues no token and leaves the Refresh cookie untouched. */
export interface CurrentUserResponse {
  readonly user: SessionUser;
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
 * One row of `GET /companies/employees`. The nulls are the point: an invitation exists before an
 * account does, so the type gives the screen no email or phone it could invent.
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
 * `POST /companies/employees/invitations`. Two fields only: the person supplies their own account
 * details when they register, and the company comes from the caller's session.
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
