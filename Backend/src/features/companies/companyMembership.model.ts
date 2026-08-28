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

/** The organizational job. Deliberately never consulted when deciding what someone may do. */
export const COMPANY_POSITIONS = [
  'main_contractor',
  'construction_manager',
  'site_manager',
  'contractor',
  'employee',
] as const;

/**
 * The approved permission codes — **currently none**, and that is deliberate.
 *
 * A code is added only when the capability it names is implemented and approved, never ahead of it,
 * so this list can never describe a power the platform does not actually have. Because the list is
 * empty, `CompanyPermission` is `never` today: the compiler rejects any code that has not been
 * approved, and the first approved capability makes the type meaningful in the same edit.
 *
 * The schema below carries no `enum` for the same reason — Mongoose treats an empty one as no
 * constraint at all, which would read like a guard while being none. It arrives with the first code.
 */
export const COMPANY_PERMISSIONS = [] as const;

export type CompanyStanding = (typeof COMPANY_STANDINGS)[number];
export type CompanyMembershipStatus = (typeof COMPANY_MEMBERSHIP_STATUSES)[number];
export type CompanyPosition = (typeof COMPANY_POSITIONS)[number];
export type CompanyPermission = (typeof COMPANY_PERMISSIONS)[number];

/**
 * Two separate decisions that are allowed to differ, which is the approved rule. Both are empty
 * today only because there is no capability to grant yet — each future code decides its own default
 * on each side when it is approved, rather than an employee inheriting an owner's set.
 */
export const OWNER_DEFAULT_PERMISSIONS: readonly CompanyPermission[] = [];
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
    // No enum until the first permission code is approved — see COMPANY_PERMISSIONS.
    permissions: [{ type: String }],
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
