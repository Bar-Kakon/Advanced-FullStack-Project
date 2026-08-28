import { Schema, model, type Types } from 'mongoose';

export type UserStatus = 'active' | 'deactivated' | 'banned' | 'deleted';
export type UserLanguage = 'he' | 'en';

/** The 23 approved trade codes, identical on `register.html`, `edit-profile.html` and browse. */
export const TRADES = [
  'general',
  'electrical',
  'plumbing',
  'drilling',
  'shell',
  'concrete',
  'saferoom',
  'carpentry',
  'aluminum',
  'hvac',
  'painting',
  'tiling',
  'plastering',
  'earthworks',
  'waterproofing',
  'supply',
  'development',
  'doors',
  'sandpumps',
  'haulage_crane',
  'concrete_cutting',
  'heavy_equipment',
  'other',
] as const;

/** The region codes browse-contractors filters on. Free text can never populate this. */
export const REGIONS = [
  'nationwide',
  'north',
  'haifa',
  'sharon',
  'center',
  'telaviv',
  'jerusalem',
  'lowlands',
  'south',
] as const;

/** Do I own this business? Kept apart from position, trade, membership state and permissions. */
export const COMPANY_STANDINGS = ['owner', 'member'] as const;

/** What is my job inside the business? Never implies ownership and never implies a trade. */
export const COMPANY_POSITIONS = [
  'main_contractor',
  'construction_manager',
  'site_manager',
  'contractor',
  'employee',
] as const;

/** Is my link to the business live? The invitation flow that writes `invited` is not built yet. */
export const COMPANY_MEMBERSHIP_STATUSES = ['invited', 'active', 'inactive'] as const;

export type Trade = (typeof TRADES)[number];
export type Region = (typeof REGIONS)[number];
export type CompanyStanding = (typeof COMPANY_STANDINGS)[number];
export type CompanyPosition = (typeof COMPANY_POSITIONS)[number];
export type CompanyMembershipStatus = (typeof COMPANY_MEMBERSHIP_STATUSES)[number];

/** The authentication identity. `passwordHash` is absent by default — see `UserWithPasswordHash`. */
export interface UserRecord {
  readonly _id: Types.ObjectId;
  readonly email: string;
  readonly status: UserStatus;
  readonly firstName: string;
  readonly lastName: string;
  readonly language: UserLanguage;
  readonly profileComplete: boolean;
}

export interface UserWithPasswordHash extends UserRecord {
  readonly passwordHash: string;
}

export const USER_STATUSES: readonly UserStatus[] = ['active', 'deactivated', 'banned', 'deleted'];

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    status: { type: String, enum: USER_STATUSES, default: 'active', required: true, index: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    language: { type: String, enum: ['he', 'en'], default: 'he', required: true },
    profileComplete: { type: Boolean, default: false, required: true },

    // The organization the person works through, and their standing inside it. Four separate
    // concepts on purpose: standing, position, trade and membership state never imply each other.
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    companyStanding: { type: String, enum: COMPANY_STANDINGS, required: true },
    companyPosition: { type: String, enum: COMPANY_POSITIONS },
    companyMembershipStatus: {
      type: String,
      enum: COMPANY_MEMBERSHIP_STATUSES,
      default: 'active',
      required: true,
    },

    specialties: [{ type: String, enum: TRADES }],
    // Descriptive only. It never becomes a browse filter value — `specialties` stays the enum.
    specialtyOther: { type: String, trim: true, maxlength: 60 },

    // The individual's own business number. Never a fallback for the company office number, which
    // lives on a different document entirely, and never the personal/login `phone`.
    businessPhone: { type: String, trim: true },

    location: {
      city: { type: String, trim: true },
      region: { type: String, enum: REGIONS },
    },
  },
  { timestamps: true },
);

export const UserModel = model('User', userSchema);
