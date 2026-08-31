import { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import type { PlanCode } from '../billing/plan.model.js';
import { DEFAULT_PLAN_CODE } from '../billing/planCatalogue.js';
import {
  INITIAL_TOKEN_VERSION,
  UserModel,
  type AuthProvider,
  type ProviderIdentity,
  type ContactVisibility,
  type DrillingType,
  type HeavyEquipment,
  type NotificationPreferences,
  type Region,
  type RegistrationCategory,
  type Specialty,
  type TermsAcceptance,
  type UserProfileRecord,
  type StoredApprovedTravelLocation,
  type StoredExcludedTravelLocation,
  type StoredPlace,
  type UserRecord,
  type UserStatus,
  type UserWithPasswordHash,
} from './user.model.js';

const IDENTITY_FIELDS = 'email status isAdmin firstName lastName language profileComplete identities security.passwordChangedAt security.tokenVersion';

/**
 * Everything the profile screens read, and nothing else. `passwordHash` is `select: false` and is
 * absent from this list anyway; `termsAcceptances` and `security` are deliberately not here,
 * because no profile screen shows them and a projection is the cheapest place to keep it that way.
 */
const PROFILE_FIELDS = `${IDENTITY_FIELDS} bio registrationCategory specialties specialtyOther heavyEquipment drillingTypes notificationPreferences businessPhone contactVisibility location approvedTravelLocations schedulingPrefs avatar`;

/**
 * The write shape, deliberately separate from `UserRecord`. A caller can only supply what it lists,
 * so no request body can reach the document with a `status`, an `isAdmin` or a `passwordHash` of
 * its own choosing.
 *
 * It carries nothing about a company: which business a person belongs to, and on what terms, is a
 * relationship and lives in `companymemberships`.
 */
export interface NewUser {
  readonly email: string;
  /** Absent on the provider path. No placeholder is written, so no password can be guessed at. */
  readonly passwordHash?: string;
  /** Written at creation on the provider path, so the link and the account commit together. */
  readonly identities?: readonly ProviderIdentity[];
  readonly firstName: string;
  readonly lastName: string;
  readonly registrationCategory: RegistrationCategory;
  readonly specialties: readonly Specialty[];
  readonly specialtyOther?: string;
  readonly drillingTypes?: readonly DrillingType[];
  readonly notificationPreferences: NotificationPreferences;
  readonly businessPhone?: string;
  readonly contactVisibility?: ContactVisibility;
  readonly location: { readonly city: string; readonly region: Region; readonly place?: StoredPlace };
  readonly termsAcceptances: readonly TermsAcceptance[];
}

/** An explicit allowlist: only these may be written by a profile update. */
export interface ProfileUpdate {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly bio?: string;
  readonly specialties?: readonly Specialty[];
  readonly specialtyOther?: string | null;
  /** An empty array is a real answer: the specialty is held, no machine is named yet. */
  readonly heavyEquipment?: readonly HeavyEquipment[];
  /** Likewise: drilling is held, no subtype is named yet. */
  readonly drillingTypes?: readonly DrillingType[];
  readonly businessPhone?: string | null;
  readonly contactVisibility?: ContactVisibility;
  readonly city?: string;
  readonly region?: Region;
  /** Written only when the person picked a real Google place; never derived from `city`. */
  readonly place?: StoredPlace;
  readonly travelRadiusKm?: number;
  readonly delayToleranceDays?: number;
  readonly noticeRequiredDays?: number;
}

/** What a protected route needs to know about a token holder, and nothing more. */
export interface CredentialState {
  readonly status: UserStatus;
  /** The version every Access Token for this account must carry to be accepted. */
  readonly tokenVersion: number;
}

/**
 * The account state a moderator reviews and acts on. It is deliberately not the profile: reviewing
 * a report needs an identity and a status, never a bio, a phone or a travel list.
 */
export interface ModerationSubject {
  readonly id: Types.ObjectId;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly status: UserStatus;
  readonly isAdmin: boolean;
}

export interface TravelPreferencesUpdate {
  readonly travelRadiusKm?: number;
  readonly place?: StoredPlace;
  readonly approvedTravelLocations: readonly StoredApprovedTravelLocation[];
  readonly excludedTravelLocations: readonly StoredExcludedTravelLocation[];
}

/** The person's own travel answers. `excludedTravelLocations` is private and never reaches a viewer. */
export interface TravelPreferencesRecord {
  readonly travelRadiusKm: number | null;
  readonly basePlace: StoredPlace | null;
  readonly approvedTravelLocations: readonly StoredApprovedTravelLocation[];
  readonly excludedTravelLocations: readonly StoredExcludedTravelLocation[];
}

export interface PasswordUpdate {
  readonly passwordHash: string;
  readonly passwordChangedAt: Date;
}

export interface UserRepository {
  findByEmailWithPasswordHash(email: string): Promise<UserWithPasswordHash | null>;
  /** Identity only. Password reset never needs the hash it is about to replace. */
  findByEmail(email: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  findProfileById(id: string): Promise<UserProfileRecord | null>;
  updateProfile(id: Types.ObjectId, update: ProfileUpdate): Promise<void>;
  setAvatarFile(id: Types.ObjectId, fileId: Types.ObjectId | null): Promise<void>;
  /** Writes the structured base place, the explicit approved list and the exclusions together. */
  saveTravelPreferences(id: Types.ObjectId, update: TravelPreferencesUpdate): Promise<void>;
  findTravelPreferences(id: string): Promise<TravelPreferencesRecord | null>;
  /** The narrowest read the auth middleware can make: `null` when no such user exists. */
  findCredentialState(id: string): Promise<CredentialState | null>;
  /** The one question the platform-authority middleware asks, straight from the database. */
  isPlatformAdmin(id: string): Promise<boolean>;
  findModerationSubject(id: string): Promise<ModerationSubject | null>;
  /**
   * Display names for a set of accounts, as one query. An id with no row is simply absent from
   * the map, which is how a deleted account renders as the neutral identity rather than crashing.
   */
  findDisplayNames(ids: readonly Types.ObjectId[]): Promise<Map<string, string>>;
  /**
   * The moderation status transition. The filter names the status being moved away from, so two
   * moderators acting at once cannot both believe they applied it.
   */
  transitionStatus(id: Types.ObjectId, from: UserStatus, to: UserStatus): Promise<boolean>;
  /** The hash and the change stamp move together, so one call writes both. */
  updatePassword(id: Types.ObjectId, update: PasswordUpdate, session?: DbSession): Promise<void>;
  existsByEmail(email: string): Promise<boolean>;
  create(user: NewUser, session?: DbSession): Promise<UserRecord>;
  /** Resolves a provider sign-in by the provider's own stable id, never by the email beside it. */
  findByProviderIdentity(provider: AuthProvider, subject: string): Promise<UserRecord | null>;
  /**
   * Attaches a provider to an account that has none of that provider yet. Answers `false` when a
   * link already exists, so a second attempt cannot silently overwrite the first.
   */
  linkProviderIdentity(id: Types.ObjectId, identity: ProviderIdentity): Promise<boolean>;
  /** Whether a local password exists, without the hash leaving the repository. */
  hasPassword(id: string): Promise<boolean>;
  /** The cached tier. `null` only when no such account exists. */
  findPlanCode(id: string): Promise<PlanCode | null>;
  /** Written only by the subscription lifecycle, and only ever inside its transaction. */
  setPlanCode(id: Types.ObjectId, planCode: PlanCode, session?: DbSession): Promise<void>;
}

/**
 * The only module that queries `users` for authentication. `.lean()` keeps a plain object at the
 * boundary, so nothing downstream can call a Mongoose document method or re-save the user.
 */
export const userRepository: UserRepository = {
  /** A document with no stored hash answers `null` rather than an absent key, so the caller has
   *  one shape to handle and cannot read `undefined` as a hash. */
  async findByEmailWithPasswordHash(email) {
    const found = await UserModel.findOne({ email })
      .select(`${IDENTITY_FIELDS} +passwordHash`)
      .lean<UserRecord & { passwordHash?: string }>()
      .exec();
    if (found === null) return null;

    const { passwordHash, ...user } = found;
    return { ...user, passwordHash: passwordHash ?? null };
  },

  async findByEmail(email) {
    return UserModel.findOne({ email }).select(IDENTITY_FIELDS).lean<UserRecord>().exec();
  },

  async findCredentialState(id) {
    if (!Types.ObjectId.isValid(id)) return null;

    const found = await UserModel.findById(id)
      .select('status security.tokenVersion')
      .lean<{ status: UserStatus; security?: { tokenVersion?: number } }>()
      .exec();

    if (found === null) return null;
    return {
      status: found.status,
      tokenVersion: found.security?.tokenVersion ?? INITIAL_TOKEN_VERSION,
    };
  },

  /**
   * Read from the account, never from the request and never from a token claim, so no payload a
   * caller controls can promote itself. The cost is one indexed lookup on an admin route only.
   */
  async isPlatformAdmin(id) {
    if (!Types.ObjectId.isValid(id)) return false;

    const found = await UserModel.findById(id)
      .select('isAdmin')
      .lean<{ isAdmin?: boolean }>()
      .exec();

    return found?.isAdmin === true;
  },

  async findModerationSubject(id) {
    if (!Types.ObjectId.isValid(id)) return null;

    const found = await UserModel.findById(id)
      .select('email firstName lastName status isAdmin')
      .lean<Omit<ModerationSubject, 'id'> & { _id: Types.ObjectId }>()
      .exec();

    if (found === null) return null;
    const { _id, ...rest } = found;
    return { id: _id, ...rest, isAdmin: rest.isAdmin === true };
  },

  async findDisplayNames(ids) {
    if (ids.length === 0) return new Map();

    const rows = await UserModel.find({ _id: { $in: [...ids] } })
      .select('firstName lastName')
      .lean<{ _id: Types.ObjectId; firstName: string; lastName: string }[]>()
      .exec();

    return new Map(
      rows.map((row) => [row._id.toString(), `${row.firstName} ${row.lastName}`.trim()]),
    );
  },

  async transitionStatus(id, from, to) {
    const result = await UserModel.updateOne({ _id: id, status: from }, { $set: { status: to } }).exec();
    return result.modifiedCount === 1;
  },

  async updatePassword(id, { passwordHash, passwordChangedAt }, session) {
    const query = UserModel.updateOne(
      { _id: id },
      {
        $set: { passwordHash, 'security.passwordChangedAt': passwordChangedAt },
        $inc: { 'security.tokenVersion': 1 },
      },
    );
    if (session) query.session(session);
    await query.exec();
  },

  async findById(id) {
    if (!Types.ObjectId.isValid(id)) return null;

    return UserModel.findById(id).select(IDENTITY_FIELDS).lean<UserRecord>().exec();
  },

  async findProfileById(id) {
    if (!Types.ObjectId.isValid(id)) return null;

    return UserModel.findById(id).select(PROFILE_FIELDS).lean<UserProfileRecord>().exec();
  },

  /**
   * Field by field, never a spread of the request body. The nested paths are written with dotted
   * keys so one edit cannot replace a whole sub-document and silently drop its siblings.
   *
   * `null` means "clear this optional value" and produces an `$unset`; an absent key is left
   * alone. That distinction is what stops an empty string being written where no value belongs.
   */
  async updateProfile(id, update) {
    const $set: Record<string, unknown> = {};
    const $unset: Record<string, ''> = {};

    const put = (path: string, value: unknown): void => {
      if (value === undefined) return;
      if (value === null) $unset[path] = '';
      else $set[path] = value;
    };

    put('firstName', update.firstName);
    put('lastName', update.lastName);
    put('bio', update.bio);
    if (update.specialties !== undefined) $set['specialties'] = [...update.specialties];
    put('specialtyOther', update.specialtyOther);
    if (update.heavyEquipment !== undefined) $set['heavyEquipment'] = [...update.heavyEquipment];
    if (update.drillingTypes !== undefined) $set['drillingTypes'] = [...update.drillingTypes];
    put('businessPhone', update.businessPhone);
    put('contactVisibility', update.contactVisibility);
    put('location.city', update.city);
    put('location.region', update.region);
    put('location.place', update.place);
    put('location.travelRadiusKm', update.travelRadiusKm);
    put('schedulingPrefs.delayToleranceDays', update.delayToleranceDays);
    put('schedulingPrefs.noticeRequiredDays', update.noticeRequiredDays);

    const ops: Record<string, unknown> = {};
    if (Object.keys($set).length > 0) ops['$set'] = $set;
    if (Object.keys($unset).length > 0) ops['$unset'] = $unset;
    if (Object.keys(ops).length === 0) return;

    await UserModel.updateOne({ _id: id }, ops).exec();
  },

  async setAvatarFile(id, fileId) {
    await UserModel.updateOne(
      { _id: id },
      fileId === null ? { $unset: { 'avatar.fileId': '' } } : { $set: { 'avatar.fileId': fileId } },
    ).exec();
  },

  async saveTravelPreferences(
    id,
    { travelRadiusKm, place, approvedTravelLocations, excludedTravelLocations },
  ) {
    const $set: Record<string, unknown> = {
      approvedTravelLocations: [...approvedTravelLocations],
      excludedTravelLocations: [...excludedTravelLocations],
    };
    if (travelRadiusKm !== undefined) $set['location.travelRadiusKm'] = travelRadiusKm;
    if (place !== undefined) $set['location.place'] = place;

    await UserModel.updateOne({ _id: id }, { $set }).exec();
  },

  async findTravelPreferences(id) {
    if (!Types.ObjectId.isValid(id)) return null;

    const found = await UserModel.findById(id)
      .select('location.travelRadiusKm location.place approvedTravelLocations excludedTravelLocations')
      .lean<{
        location?: { travelRadiusKm?: number; place?: StoredPlace };
        approvedTravelLocations?: readonly StoredApprovedTravelLocation[];
        excludedTravelLocations?: readonly StoredExcludedTravelLocation[];
      }>()
      .exec();
    if (found === null) return null;

    return {
      travelRadiusKm: found.location?.travelRadiusKm ?? null,
      basePlace: found.location?.place ?? null,
      approvedTravelLocations: found.approvedTravelLocations ?? [],
      excludedTravelLocations: found.excludedTravelLocations ?? [],
    };
  },

  /** A courtesy check only. The unique index on `email` is what actually guarantees uniqueness. */
  async existsByEmail(email) {
    const found = await UserModel.exists({ email }).exec();
    return found !== null;
  },

  /**
   * Reads the new document back through the same projection every other query uses, so a freshly
   * registered user and a freshly logged-in one are provably the same shape — and the hash cannot
   * ride along, because it is not in that projection. The read joins the caller's session, or it
   * would not see a document the open transaction has not committed yet.
   */
  async create({ specialties, drillingTypes, termsAcceptances, identities, ...user }, session) {
    const [created] = await UserModel.create(
      [
        {
          ...user,
          specialties: [...specialties],
          termsAcceptances: [...termsAcceptances],
          ...(drillingTypes === undefined ? {} : { drillingTypes: [...drillingTypes] }),
          ...(identities === undefined ? {} : { identities: [...identities] }),
        },
      ],
      session ? { session } : {},
    );
    if (created === undefined) throw new Error('User insert returned no document.');

    const query = UserModel.findById(created._id).select(IDENTITY_FIELDS);
    if (session) query.session(session);

    return query.lean<UserRecord>().orFail().exec();
  },

  async findByProviderIdentity(provider, subject) {
    return UserModel.findOne({ identities: { $elemMatch: { provider, subject } } })
      .select(IDENTITY_FIELDS)
      .lean<UserRecord>()
      .exec();
  },

  /**
   * The filter is what makes this safe under concurrency: the account is matched only while it
   * holds no link for that provider, so two simultaneous link attempts cannot both write one.
   */
  async linkProviderIdentity(id, identity) {
    const result = await UserModel.updateOne(
      { _id: id, 'identities.provider': { $ne: identity.provider } },
      { $push: { identities: identity } },
    ).exec();

    return result.modifiedCount === 1;
  },

  async hasPassword(id) {
    if (!Types.ObjectId.isValid(id)) return false;

    const found = await UserModel.findById(id)
      .select('+passwordHash')
      .lean<{ passwordHash?: string }>()
      .exec();

    return typeof found?.passwordHash === 'string' && found.passwordHash.length > 0;
  },

  async findPlanCode(id) {
    if (!Types.ObjectId.isValid(id)) return null;

    const found = await UserModel.findById(id)
      .select('planCode')
      .lean<{ planCode?: PlanCode }>()
      .exec();
    if (found === null) return null;

    return found.planCode ?? DEFAULT_PLAN_CODE;
  },

  async setPlanCode(id, planCode, session) {
    const query = UserModel.updateOne({ _id: id }, { $set: { planCode } });
    if (session) query.session(session);
    await query.exec();
  },
};
