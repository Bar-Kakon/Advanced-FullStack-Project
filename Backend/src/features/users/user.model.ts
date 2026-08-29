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

/** The ten machine codes the approved profile screens have always offered. */
export const HEAVY_EQUIPMENT = [
  'excavator',
  'backhoe',
  'drill_rig',
  'mini_excavator',
  'crawler',
  'jcb',
  'wheel_loader',
  'bobcat',
  'bulldozer',
  'hooklift_truck',
] as const;

export type Trade = (typeof TRADES)[number];
export type Region = (typeof REGIONS)[number];
export type HeavyEquipment = (typeof HEAVY_EQUIPMENT)[number];

/**
 * One recorded consent. The version is what makes it provable: a timestamp alone cannot say *what*
 * was agreed to once the Terms change.
 */
export interface TermsAcceptance {
  readonly version: string;
  readonly acceptedAt: Date;
}

/** The authentication identity. `passwordHash` is absent by default — see `UserWithPasswordHash`. */
export interface UserProfileFields {
  readonly bio?: string;
  readonly specialties: readonly Trade[];
  readonly specialtyOther?: string;
  readonly heavyEquipment?: readonly HeavyEquipment[];
  readonly businessPhone?: string;
  readonly location?: {
    readonly city?: string;
    readonly region?: Region;
    readonly travelRadiusKm?: number;
    readonly place?: StoredPlace;
  };
  readonly approvedTravelLocations?: readonly StoredApprovedTravelLocation[];
  readonly excludedTravelLocations?: readonly StoredExcludedTravelLocation[];
  readonly schedulingPrefs?: { readonly delayToleranceDays?: number; readonly noticeRequiredDays?: number };
  readonly avatar?: { readonly fileId?: Types.ObjectId };
}

export interface StoredPlace {
  readonly placeId: string;
  readonly displayName: string;
  readonly city?: string;
  readonly adminArea?: string;
  readonly latitude: number;
  readonly longitude: number;
}

export interface StoredApprovedTravelLocation extends StoredPlace {
  readonly source: 'suggested' | 'manual';
  readonly approvedAt: Date;
  readonly drivingDistanceMeters?: number;
}

/** A place the person took out of a proposal. The radius proposal never suggests these again. */
export interface StoredExcludedTravelLocation {
  readonly placeId: string;
  readonly displayName: string;
  readonly excludedAt: Date;
}

export interface UserRecord {
  readonly _id: Types.ObjectId;
  readonly email: string;
  readonly status: UserStatus;
  readonly firstName: string;
  readonly lastName: string;
  readonly language: UserLanguage;
  readonly profileComplete: boolean;
  readonly security?: { readonly passwordChangedAt?: Date };
}

/** The identity fields plus everything the profile screens read. */
export interface UserProfileRecord extends UserRecord, UserProfileFields {}

export interface UserWithPasswordHash extends UserRecord {
  readonly passwordHash: string;
}

export const USER_STATUSES: readonly UserStatus[] = ['active', 'deactivated', 'banned', 'deleted'];

const placeSchema = new Schema(
  {
    placeId: { type: String, required: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    city: { type: String, trim: true },
    adminArea: { type: String, trim: true },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
  },
  { _id: false },
);

const approvedTravelLocationSchema = new Schema(
  {
    placeId: { type: String, required: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    city: { type: String, trim: true },
    adminArea: { type: String, trim: true },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
    source: { type: String, enum: ['suggested', 'manual'], required: true },
    approvedAt: { type: Date, required: true },
    drivingDistanceMeters: { type: Number, min: 0 },
  },
  { _id: false },
);

const excludedTravelLocationSchema = new Schema(
  {
    placeId: { type: String, required: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    excludedAt: { type: Date, required: true },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    status: { type: String, enum: USER_STATUSES, default: 'active', required: true, index: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    language: { type: String, enum: ['he', 'en'], default: 'he', required: true },
    profileComplete: { type: Boolean, default: false, required: true },

    // A person carries no company fields. Which business they belong to, on what terms, in what
    // position and with what permissions is a *relationship* and lives in `companymemberships` —
    // so a User is never an "owner account" or an "employee account", only a person.
    specialties: [{ type: String, enum: TRADES }],
    // Descriptive only. It never becomes a browse filter value — `specialties` stays the enum.
    specialtyOther: { type: String, trim: true, maxlength: 60 },

    // Refines the `heavy_equipment` trade the way `specialtyOther` refines `other`.
    heavyEquipment: [{ type: String, enum: HEAVY_EQUIPMENT }],

    // The individual's own business number. Never a fallback for the company office number, which
    // lives on a different document entirely, and never the personal/login `phone`.
    businessPhone: { type: String, trim: true },

    bio: { type: String, trim: true, maxlength: 600 },

    location: {
      city: { type: String, trim: true },
      region: { type: String, enum: REGIONS },
      // Preferred maximum DRIVING distance, not an aerial radius.
      travelRadiusKm: { type: Number, min: 0, max: 500 },
      // Absent on every account created before structured selection existed.
      place: { type: placeSchema, required: false },
    },

    // The explicit list the contractor confirmed. Authoritative for place willingness: a place
    // removed here is not approved even if it sits inside the radius.
    approvedTravelLocations: { type: [approvedTravelLocationSchema], default: undefined },

    // Private to the person: a place removed here is never suggested by a later radius proposal.
    excludedTravelLocations: { type: [excludedTravelLocationSchema], default: undefined },

    // Not binding. They tell the other side what timing suits before a date is proposed, and both
    // numbers are public on the profile. The bounds are provisional.
    schedulingPrefs: {
      delayToleranceDays: { type: Number, min: 0, max: 30 },
      noticeRequiredDays: { type: Number, min: 0, max: 14 },
    },

    // A pointer to a fileassets row, never the bytes. No denormalised URL: the client builds one
    // from the id against this API, so there is nothing to keep in step.
    avatar: {
      fileId: { type: Schema.Types.ObjectId, ref: 'FileAsset' },
    },

    // Appended to, never overwritten: a new entry per acceptance, so agreeing to a later version
    // does not erase the proof that an earlier one was agreed to. Small and bounded — one entry per
    // Terms version a person has seen — which is why it embeds rather than becoming a collection.
    termsAcceptances: [
      {
        _id: false,
        version: { type: String, required: true, trim: true },
        acceptedAt: { type: Date, required: true },
      },
    ],

    // Server-controlled, and the only input to the "is this token still valid" check. Absent means
    // the password has never been changed, which is why registration does not set it.
    security: {
      passwordChangedAt: { type: Date },
    },
  },
  { timestamps: true },
);

// Browse filters on an explicitly approved place, which is a multikey lookup on one field.
userSchema.index({ 'approvedTravelLocations.placeId': 1 });

// Browse's discovery sort and its cursor tiebreaker.
userSchema.index({ status: 1, createdAt: -1, _id: -1 });

export const UserModel = model('User', userSchema);
