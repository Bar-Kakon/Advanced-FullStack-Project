import { Schema, model, type Types } from 'mongoose';

/**
 * Whether this person owns the business or works under it. It lives on the relationship, never on
 * the user: a person is not an "employee account", they are somebody holding an employee
 * relationship with one particular company.
 */
export const COMPANY_STANDINGS = ['owner', 'employee'] as const;

/**
 * The life of one relationship, in order:
 *
 *   invited                    an owner opened a seat. NO user yet.
 *   pending_company_approval   somebody claimed that seat by registering.
 *   active                     the owner approved them.
 *   inactive                   they have left, or were deactivated.
 */
export const COMPANY_MEMBERSHIP_STATUSES = [
  'invited',
  'pending_company_approval',
  'active',
  'inactive',
] as const;

/**
 * The organizational job. Deliberately never consulted when deciding what someone may do.
 *
 * `regional_construction_manager` was added 2026-08-29 on owner instruction, naming a role the
 * vocabulary already distinguished in words but had no code for. The codes are stable identifiers:
 * a display label may be reworded without touching one.
 */
export const COMPANY_POSITIONS = [
  'main_contractor',
  'construction_manager',
  'regional_construction_manager',
  'site_manager',
  'contractor',
  'employee',
] as const;

/**
 * The approved permission codes, and **exactly** these four. Each names a capability that was
 * approved as an owner default: create projects, create tasks, manage their own company, and
 * add/invite employees.
 *
 * The list is closed on purpose. Because `CompanyPermission` is derived from it, a fifth code is a
 * compile error until the capability it names is itself implemented and approved — so the
 * vocabulary can never run ahead of the product.
 */
export const COMPANY_PERMISSIONS = [
  'project.create',
  'task.create',
  'company.manage',
  'company.invite_employees',
] as const;

export type CompanyStanding = (typeof COMPANY_STANDINGS)[number];
export type CompanyMembershipStatus = (typeof COMPANY_MEMBERSHIP_STATUSES)[number];
export type CompanyPosition = (typeof COMPANY_POSITIONS)[number];
export type CompanyPermission = (typeof COMPANY_PERMISSIONS)[number];

/**
 * An owner runs the business, so public Register grants all four at signup. Writing them now rather
 * than deriving them later is what keeps the rule true for accounts created before the
 * authorization layer exists — no backfill, and no owner who silently has no authority.
 */
export const OWNER_DEFAULT_PERMISSIONS: readonly CompanyPermission[] = [...COMPANY_PERMISSIONS];

/**
 * An employee receives **none** of them. Having an account, or a company position, grants nothing;
 * an owner or an authorized manager grants capabilities explicitly, one at a time.
 */
export const EMPLOYEE_DEFAULT_PERMISSIONS: readonly CompanyPermission[] = [];

export interface CompanyMembershipRecord {
  readonly _id: Types.ObjectId;
  readonly company: Types.ObjectId;
  readonly user: Types.ObjectId | null;
  readonly invitedFullName?: string;
  readonly standing: CompanyStanding;
  readonly status: CompanyMembershipStatus;
  readonly companyPosition?: CompanyPosition;
  readonly permissions: readonly CompanyPermission[];
}

const companyMembershipSchema = new Schema(
  {
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    // Null until somebody claims the seat, which is the whole reason an invitation can exist
    // before an account does.
    user: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    // What the owner typed when opening the seat. Used to match a later self-registration.
    invitedFullName: { type: String, trim: true },
    standing: { type: String, enum: COMPANY_STANDINGS, required: true },
    status: { type: String, enum: COMPANY_MEMBERSHIP_STATUSES, required: true },
    companyPosition: { type: String, enum: COMPANY_POSITIONS },
    permissions: [{ type: String, enum: COMPANY_PERMISSIONS }],
  },
  { timestamps: true },
);

// Serves the future employee-management screen: this company's pending activations, and the
// invitation lookup a self-registration has to match against.
companyMembershipSchema.index({ company: 1, status: 1 });

// One active relationship per person at a time. Partial, so the invited and pending rows a person
// may hold against several companies are untouched — only activation is exclusive. Same technique
// `subscriptions` uses for one active row per user.
companyMembershipSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);

export const CompanyMembershipModel = model('CompanyMembership', companyMembershipSchema);
