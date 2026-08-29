import { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import {
  UserModel,
  type Region,
  type TermsAcceptance,
  type Trade,
  type UserRecord,
  type UserStatus,
  type UserWithPasswordHash,
} from './user.model.js';

const IDENTITY_FIELDS = 'email status firstName lastName language profileComplete security.passwordChangedAt';

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

/** What a protected route needs to know about a token holder, and nothing more. */
export interface CredentialState {
  readonly status: UserStatus;
  readonly passwordChangedAt: Date | null;
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
  /** The narrowest read the auth middleware can make: `null` when no such user exists. */
  findCredentialState(id: string): Promise<CredentialState | null>;
  /** The hash and the change stamp move together, so one call writes both. */
  updatePassword(id: Types.ObjectId, update: PasswordUpdate, session?: DbSession): Promise<void>;
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

  async findByEmail(email) {
    return UserModel.findOne({ email }).select(IDENTITY_FIELDS).lean<UserRecord>().exec();
  },

  async findCredentialState(id) {
    if (!Types.ObjectId.isValid(id)) return null;

    const found = await UserModel.findById(id)
      .select('status security.passwordChangedAt')
      .lean<{ status: UserStatus; security?: { passwordChangedAt?: Date } }>()
      .exec();

    if (found === null) return null;
    return { status: found.status, passwordChangedAt: found.security?.passwordChangedAt ?? null };
  },

  async updatePassword(id, { passwordHash, passwordChangedAt }, session) {
    const query = UserModel.updateOne(
      { _id: id },
      { $set: { passwordHash, 'security.passwordChangedAt': passwordChangedAt } },
    );
    if (session) query.session(session);
    await query.exec();
  },

  async findById(id) {
    if (!Types.ObjectId.isValid(id)) return null;

    return UserModel.findById(id).select(IDENTITY_FIELDS).lean<UserRecord>().exec();
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
