import { Types } from 'mongoose';

import {
  UserModel,
  type CompanyMembershipStatus,
  type CompanyStanding,
  type Region,
  type Trade,
  type UserRecord,
  type UserWithPasswordHash,
} from './user.model.js';

const IDENTITY_FIELDS = 'email status firstName lastName language profileComplete';

/**
 * The write shape, deliberately separate from `UserRecord`. A caller can only supply what it lists,
 * so no request body can reach the document with a `status`, an `isAdmin` or a `passwordHash` of
 * its own choosing.
 */
export interface NewUser {
  readonly email: string;
  readonly passwordHash: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly company: Types.ObjectId;
  readonly companyStanding: CompanyStanding;
  readonly companyMembershipStatus: CompanyMembershipStatus;
  readonly specialties: readonly Trade[];
  readonly specialtyOther?: string;
  readonly businessPhone?: string;
  readonly location: { readonly city: string; readonly region: Region };
}

export interface UserRepository {
  findByEmailWithPasswordHash(email: string): Promise<UserWithPasswordHash | null>;
  findById(id: string): Promise<UserRecord | null>;
  existsByEmail(email: string): Promise<boolean>;
  create(user: NewUser): Promise<UserRecord>;
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

  /** A courtesy check only. The unique index on `email` is what actually guarantees uniqueness. */
  async existsByEmail(email) {
    const found = await UserModel.exists({ email }).exec();
    return found !== null;
  },

  /**
   * Reads the new document back through the same projection every other query uses, so a freshly
   * registered user and a freshly logged-in one are provably the same shape — and the hash cannot
   * ride along, because it is not in that projection.
   */
  async create(user) {
    const created = await UserModel.create({ ...user, specialties: [...user.specialties] });

    return UserModel.findById(created._id)
      .select(IDENTITY_FIELDS)
      .lean<UserRecord>()
      .orFail()
      .exec();
  },
};
