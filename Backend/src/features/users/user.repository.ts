import { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import {
  UserModel,
  type Region,
  type TermsAcceptance,
  type Trade,
  type UserProfileRecord,
  type UserRecord,
  type UserWithPasswordHash,
} from './user.model.js';

const IDENTITY_FIELDS = 'email status firstName lastName language profileComplete';

/**
 * Everything the profile screens read, and nothing else. `passwordHash` is `select: false` and is
 * absent from this list anyway; `termsAcceptances` and `security` are deliberately not here,
 * because no profile screen shows them and a projection is the cheapest place to keep it that way.
 */
const PROFILE_FIELDS = `${IDENTITY_FIELDS} bio specialties specialtyOther businessPhone location schedulingPrefs avatar`;

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
  readonly passwordHash: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly specialties: readonly Trade[];
  readonly specialtyOther?: string;
  readonly businessPhone?: string;
  readonly location: { readonly city: string; readonly region: Region };
  readonly termsAcceptances: readonly TermsAcceptance[];
}

/** An explicit allowlist: only these may be written by a profile update. */
export interface ProfileUpdate {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly bio?: string;
  readonly specialties?: readonly Trade[];
  readonly specialtyOther?: string | null;
  readonly businessPhone?: string | null;
  readonly city?: string;
  readonly region?: Region;
  readonly travelRadiusKm?: number;
  readonly delayToleranceDays?: number;
  readonly noticeRequiredDays?: number;
}

export interface UserRepository {
  findByEmailWithPasswordHash(email: string): Promise<UserWithPasswordHash | null>;
  findById(id: string): Promise<UserRecord | null>;
  findProfileById(id: string): Promise<UserProfileRecord | null>;
  updateProfile(id: Types.ObjectId, update: ProfileUpdate): Promise<void>;
  setAvatarFile(id: Types.ObjectId, fileId: Types.ObjectId | null): Promise<void>;
  existsByEmail(email: string): Promise<boolean>;
  create(user: NewUser, session?: DbSession): Promise<UserRecord>;
}

/**
 * The only module that queries `users` for authentication. `.lean()` keeps a plain object at the
 * boundary, so nothing downstream can call a Mongoose document method or re-save the user.
 */
export const userRepository: UserRepository = {
  async findByEmailWithPasswordHash(email) {
    return UserModel.findOne({ email })
      .select(`${IDENTITY_FIELDS} +passwordHash`)
      .lean<UserWithPasswordHash>()
      .exec();
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
    put('businessPhone', update.businessPhone);
    put('location.city', update.city);
    put('location.region', update.region);
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
  async create(user, session) {
    const [created] = await UserModel.create(
      [
        {
          ...user,
          specialties: [...user.specialties],
          termsAcceptances: [...user.termsAcceptances],
        },
      ],
      session ? { session } : {},
    );
    if (created === undefined) throw new Error('User insert returned no document.');

    const query = UserModel.findById(created._id).select(IDENTITY_FIELDS);
    if (session) query.session(session);

    return query.lean<UserRecord>().orFail().exec();
  },
};
