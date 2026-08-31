import { createHash } from 'node:crypto';

import { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import { RefreshTokenModel, type RefreshTokenRecord } from './refreshToken.model.js';

export interface StoredRefreshToken {
  readonly tokenHash: string;
  readonly userId: string;
  readonly family: string;
  readonly expiresAt: Date;
}

export interface RefreshTokenRepository {
  hash(rawToken: string): string;
  save(token: StoredRefreshToken): Promise<void>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  markUsed(id: Types.ObjectId): Promise<void>;
  revokeFamily(family: string): Promise<void>;
  /** Every family at once, for a credential change that invalidates all of a user's sessions. */
  revokeAllForUser(userId: Types.ObjectId, session?: DbSession): Promise<void>;
}

/**
 * SHA-256 rather than bcrypt: the value being hashed is a 200-plus-character signed token with full
 * machine entropy, not a human-chosen password, so there is no dictionary to slow an attacker down
 * against — and this hash runs on every refresh, where bcrypt's deliberate cost would be a tax.
 */
const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

export const refreshTokenRepository: RefreshTokenRepository = {
  hash: sha256Hex,

  async save({ tokenHash, userId, family, expiresAt }) {
    await RefreshTokenModel.create({ tokenHash, user: new Types.ObjectId(userId), family, expiresAt });
  },

  async findByHash(tokenHash) {
    return RefreshTokenModel.findOne({ tokenHash }).lean<RefreshTokenRecord>().exec();
  },

  async markUsed(id) {
    await RefreshTokenModel.updateOne({ _id: id }, { $set: { usedAt: new Date() } }).exec();
  },

  async revokeFamily(family) {
    await RefreshTokenModel.updateMany(
      { family, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    ).exec();
  },

  async revokeAllForUser(userId, session) {
    const query = RefreshTokenModel.updateMany(
      { user: userId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
    if (session) query.session(session);
    await query.exec();
  },
};
