import { createHash, randomBytes } from 'node:crypto';

import type { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import {
  AccountRecoveryTokenModel,
  type AccountRecoveryTokenRecord,
} from './accountRecoveryToken.model.js';

/** 32 bytes from the OS CSPRNG, hex-encoded: 64 characters, 256 bits of entropy. */
const TOKEN_BYTES = 32;

export interface IssuedRecoveryToken {
  /** Goes in the email and nowhere else — never stored, never logged. */
  readonly rawToken: string;
  readonly expiresAt: Date;
}

export interface AccountRecoveryTokenRepository {
  hash(rawToken: string): string;
  /** Mints one token and invalidates every other live token that user holds. */
  issueFor(userId: Types.ObjectId, expiresAt: Date): Promise<IssuedRecoveryToken>;
  findByHash(tokenHash: string): Promise<AccountRecoveryTokenRecord | null>;
  markUsed(id: Types.ObjectId, session?: DbSession): Promise<void>;
}

const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

export const accountRecoveryTokenRepository: AccountRecoveryTokenRepository = {
  hash: sha256Hex,

  async issueFor(userId, expiresAt) {
    const rawToken = randomBytes(TOKEN_BYTES).toString('hex');

    // Invalidate before inserting, so two racing requests converge on "the later link works".
    await AccountRecoveryTokenModel.updateMany(
      { user: userId, usedAt: null, invalidatedAt: null },
      { $set: { invalidatedAt: new Date() } },
    ).exec();

    await AccountRecoveryTokenModel.create({
      tokenHash: sha256Hex(rawToken),
      user: userId,
      expiresAt,
    });

    return { rawToken, expiresAt };
  },

  async findByHash(tokenHash) {
    return AccountRecoveryTokenModel.findOne({ tokenHash })
      .lean<AccountRecoveryTokenRecord>()
      .exec();
  },

  async markUsed(id, session) {
    const query = AccountRecoveryTokenModel.updateOne({ _id: id }, { $set: { usedAt: new Date() } });
    if (session) query.session(session);
    await query.exec();
  },
};
