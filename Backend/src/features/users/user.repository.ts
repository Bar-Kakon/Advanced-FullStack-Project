import { Types } from 'mongoose';

import { UserModel, type UserRecord, type UserWithPasswordHash } from './user.model.js';

const IDENTITY_FIELDS = 'email status firstName lastName language profileComplete';

export interface UserRepository {
  findByEmailWithPasswordHash(email: string): Promise<UserWithPasswordHash | null>;
  findById(id: string): Promise<UserRecord | null>;
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
};
