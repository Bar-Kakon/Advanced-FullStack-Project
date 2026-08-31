import { Schema, model, type Types } from 'mongoose';

import { PLAN_CODES, type PlanCode } from '../billing/plan.model.js';

export type UserStatus = 'active' | 'restricted' | 'deactivated' | 'banned' | 'deleted';
export type UserLanguage = 'he' | 'en';

export const REGISTRATION_CATEGORIES = ['contractor', 'architectural', 'supplier'] as const;
export type RegistrationCategory = (typeof REGISTRATION_CATEGORIES)[number];

/** קבלנים / בעלי מקצוע מבצעים. */
export const CONTRACTOR_SPECIALTIES = [
  'shell',
  'development_infrastructure',
  'drilling',
  'concrete_cutting',
  'door_installation',
  'waterproofing',
  'tiling',
  'plastering',
  'painting',
  'electrical',
  'plumbing',
  'metalwork',
  'carpentry',
  'stonework',
  'grouting',
  'concrete_pumps',
  'sand_pumps',
  'haulage_crane',
  'heavy_equipment',
  'contractor_other',
] as const;

/** קטגוריה אדריכלית / בעלי מקצוע. */
export const ARCHITECTURAL_SPECIALTIES = [
  'structural_engineer',
  'construction_supervisor',
  'soil_consultant',
  'architect',
  'architectural_other',
] as const;

/** ספקים. */
export const SUPPLIER_SPECIALTIES = [
  'stone_supplier',
  'building_materials_supplier',
  'steel_plant',
  'concrete_plant',
  'ceramics_supplier',
  'carpentry_supplier',
  'colored_render_plant',
  'aluminum_supplier',
  'doors_supplier',
  'drainage_pipe_supplier',
  'concrete_pump_supplier',
  'supplier_other',
] as const;

export const SPECIALTIES_BY_CATEGORY = {
  contractor: CONTRACTOR_SPECIALTIES,
  architectural: ARCHITECTURAL_SPECIALTIES,
  supplier: SUPPLIER_SPECIALTIES,
} as const;

export const SPECIALTIES = [
  ...CONTRACTOR_SPECIALTIES,
  ...ARCHITECTURAL_SPECIALTIES,
  ...SUPPLIER_SPECIALTIES,
] as const;
export type Specialty = (typeof SPECIALTIES)[number];

export const OTHER_SPECIALTY: Readonly<Record<RegistrationCategory, Specialty>> = {
  contractor: 'contractor_other',
  architectural: 'architectural_other',
  supplier: 'supplier_other',
};

export const OTHER_SPECIALTIES: readonly Specialty[] = Object.values(OTHER_SPECIALTY);

const CATEGORY_BY_SPECIALTY = new Map<Specialty, RegistrationCategory>(
  REGISTRATION_CATEGORIES.flatMap((category) =>
    SPECIALTIES_BY_CATEGORY[category].map((specialty): [Specialty, RegistrationCategory] => [
      specialty,
      category,
    ]),
  ),
);

export const categoryOfSpecialty = (specialty: Specialty): RegistrationCategory => {
  const category = CATEGORY_BY_SPECIALTY.get(specialty);
  if (category === undefined) throw new Error(`Specialty ${specialty} belongs to no category.`);
  return category;
};

export const isSpecialtyInCategory = (
  specialty: Specialty,
  category: RegistrationCategory,
): boolean => CATEGORY_BY_SPECIALTY.get(specialty) === category;

export const DRILLING_SPECIALTY = 'drilling';

/** קידוחי החדרה וצנרת PVC. */
export const DRILLING_TYPES = ['injection_pvc'] as const;
export type DrillingType = (typeof DRILLING_TYPES)[number];

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

export type Region = (typeof REGIONS)[number];
export type HeavyEquipment = (typeof HEAVY_EQUIPMENT)[number];

/**
 * A Premium timing control for one notification class.
 *
 * It moves WHEN a delivery goes out, never WHETHER it does: a blocking notification still appears
 * in-app immediately on every plan, and a quiet window only holds back the email that follows it.
 * Premium buys control, never access to essential coordination information.
 */
export interface NotificationTimingRule {
  readonly notificationClass: 'blocking' | 'nonblocking';
  /** Minutes from midnight. A delivery falling inside the window waits until it ends. */
  readonly quietFromMinute: number;
  readonly quietToMinute: number;
}

export interface NotificationPreferences {
  /** Explicit opt-in, chosen at registration with no default. The platform works without it. */
  readonly operationalEmail: boolean;
  /** Premium only, and enforced on the server — never trusted from a request body. */
  readonly timing?: readonly NotificationTimingRule[];
  /** Which hour the daily digest goes out in, 0–23. Premium only. */
  readonly digestHour?: number;
}

/**
 * The professional's own control over their published contact details — the fourth part of the
 * closed phone-visibility policy: every case the two automatic ones do not cover is theirs to
 * decide. It never widens the automatic cases, and it never reaches a personal phone, which this
 * model does not store at all.
 */
export interface ContactVisibility {
  readonly email: boolean;
  readonly businessPhone: boolean;
  readonly officePhone: boolean;
}

/** A profile shows the email; the two business numbers start withheld, which is the safe way. */
export const DEFAULT_CONTACT_VISIBILITY: ContactVisibility = {
  email: true,
  businessPhone: false,
  officePhone: false,
};

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
  readonly registrationCategory: RegistrationCategory;
  readonly specialties: readonly Specialty[];
  readonly specialtyOther?: string;
  readonly heavyEquipment?: readonly HeavyEquipment[];
  readonly drillingTypes?: readonly DrillingType[];
  readonly notificationPreferences?: NotificationPreferences;
  readonly contactVisibility?: ContactVisibility;
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

/** The external sign-in providers an account may be linked to. */
export const AUTH_PROVIDERS = ['google'] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

/**
 * One link between a Blokta account and an external provider. `subject` is the provider's own
 * stable identifier for the person, never their email — an email can be reassigned, a subject
 * cannot.
 */
export interface ProviderIdentity {
  readonly provider: AuthProvider;
  readonly subject: string;
  readonly linkedAt: Date;
}

export interface UserRecord {
  readonly _id: Types.ObjectId;
  readonly email: string;
  readonly status: UserStatus;
  readonly isAdmin: boolean;
  readonly firstName: string;
  readonly lastName: string;
  readonly language: UserLanguage;
  readonly profileComplete: boolean;
  readonly identities?: readonly ProviderIdentity[];
  /**
   * Cached from whichever subscription is currently `active`, defaulting to `free`. The
   * entitlement boundary reads it on effectively every check, so the cost belongs on the rare
   * write — a purchase, a cancellation, an expiry sweep — rather than on the common read. The
   * `subscriptions` collection stays the source of truth and is this field's only writer.
   */
  readonly planCode?: PlanCode;
  readonly security?: {
    readonly passwordChangedAt?: Date;
    readonly tokenVersion?: number;
  };
}

/** The identity fields plus everything the profile screens read. */
export interface UserProfileRecord extends UserRecord, UserProfileFields {}

/**
 * `null` is a real answer: a Google-only account has never had a local password, and no value is
 * invented for it. Password login treats the two the same way it treats a wrong password.
 */
export interface UserWithPasswordHash extends UserRecord {
  readonly passwordHash: string | null;
}

export const USER_STATUSES: readonly UserStatus[] = [
  'active',
  'restricted',
  'deactivated',
  'banned',
  'deleted',
];

/**
 * A restricted account still works. Discovery, new connections and new projects stop; everything
 * already committed runs to completion, which is the whole point of the restricted-only rule.
 */
export const PARTICIPATING_STATUSES: readonly UserStatus[] = ['active', 'restricted'];

/** Where every account starts, and what an Access Token minted before the claim existed counts as. */
export const INITIAL_TOKEN_VERSION = 0;

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

const providerIdentitySchema = new Schema(
  {
    provider: { type: String, enum: AUTH_PROVIDERS, required: true },
    subject: { type: String, required: true, trim: true },
    linkedAt: { type: Date, required: true },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },

    // Optional because a Google-only account has no local password, and inventing one would give
    // the account a credential nobody chose. Register writes it on the password path; the provider
    // path never does, and Login answers a missing hash the way it answers a wrong one.
    passwordHash: { type: String, select: false },

    // Append-only links to external sign-in providers. The subject is the provider's stable id.
    identities: { type: [providerIdentitySchema], default: undefined },

    // Written ONLY by the subscription lifecycle, never by a profile edit. Free is where every
    // account starts, and it is a product state rather than the absence of one.
    planCode: { type: String, enum: PLAN_CODES, default: 'free', required: true, index: true },
    status: { type: String, enum: USER_STATUSES, default: 'active', required: true, index: true },

    // The only global role in the system. It gates platform moderation and nothing else — no
    // project role, no company position and no granted project authority can stand in for it.
    // Never settable through any request body; see `NewUser` and `ProfileUpdate`.
    isAdmin: { type: Boolean, default: false, required: true },

    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    language: { type: String, enum: ['he', 'en'], default: 'he', required: true },
    profileComplete: { type: Boolean, default: false, required: true },

    // A person carries no company fields. Which business they belong to, on what terms, in what
    // position and with what permissions is a *relationship* and lives in `companymemberships` —
    // so a User is never an "owner account" or an "employee account", only a person.
    // Which of the three registration routes opened this account. Never derived from a specialty.
    registrationCategory: { type: String, enum: REGISTRATION_CATEGORIES, required: true, index: true },

    specialties: [{ type: String, enum: SPECIALTIES }],
    // Descriptive only. It never becomes a browse filter value — `specialties` stays the enum.
    specialtyOther: { type: String, trim: true, maxlength: 60 },

    // Refines the `heavy_equipment` specialty the way `specialtyOther` refines an `other` code.
    heavyEquipment: [{ type: String, enum: HEAVY_EQUIPMENT }],

    // Refines the `drilling` specialty.
    drillingTypes: [{ type: String, enum: DRILLING_TYPES }],

    // Chosen explicitly at registration, with no default: neither answer may be assumed. The
    // timing fields below it are absent until a Premium account sets one, and the entitlement is
    // re-checked on every write rather than trusted from whatever wrote them last.
    notificationPreferences: {
      operationalEmail: { type: Boolean, required: true },
      timing: {
        type: [
          new Schema(
            {
              notificationClass: { type: String, enum: ['blocking', 'nonblocking'], required: true },
              quietFromMinute: { type: Number, required: true, min: 0, max: 1440 },
              quietToMinute: { type: Number, required: true, min: 0, max: 1440 },
            },
            { _id: false },
          ),
        ],
        default: undefined,
      },
      digestHour: { type: Number, min: 0, max: 23 },
    },

    // The self-controlled half of phone visibility. It only ever decides the cases the two
    // automatic ones do not cover, and it can never expose a personal phone — there is no such
    // field on this document, by design.
    contactVisibility: {
      email: { type: Boolean, default: true },
      businessPhone: { type: Boolean, default: false },
      officePhone: { type: Boolean, default: false },
    },

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

    // Server-controlled. `tokenVersion` is the authoritative answer to "is this Access Token still
    // valid"; `passwordChangedAt` is retained as security history and decides nothing.
    security: {
      passwordChangedAt: { type: Date },
      tokenVersion: { type: Number, default: INITIAL_TOKEN_VERSION, min: 0 },
    },
  },
  { timestamps: true },
);

// Browse filters on an explicitly approved place, which is a multikey lookup on one field.
userSchema.index({ 'approvedTravelLocations.placeId': 1 });

// Browse's discovery sort and its cursor tiebreaker.
userSchema.index({ status: 1, createdAt: -1, _id: -1 });

/**
 * One Google subject may resolve to exactly one account, enforced by the database rather than by
 * the sign-in code. Partial, so the accounts with no identity at all are not all indexed as one
 * missing value. Both fields live in the same array, so this is a legal multikey compound.
 */
userSchema.index(
  { 'identities.provider': 1, 'identities.subject': 1 },
  { unique: true, partialFilterExpression: { 'identities.subject': { $exists: true } } },
);

export const UserModel = model('User', userSchema);
