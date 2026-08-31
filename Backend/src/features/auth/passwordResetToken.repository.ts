import { createHash, randomBytes } from 'node:crypto';

import type { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import {
  PasswordResetTokenModel,
  type PasswordResetTokenRecord,
} from './passwordResetToken.model.js';

/** 32 bytes from the OS CSPRNG, hex-encoded: 64 characters, 256 bits of entropy. */
const TOKEN_BYTES = 32;

export interface IssuedResetToken {
  /** Goes in the email and nowhere else — never stored, never logged. */
  readonly rawToken: string;
  readonly expiresAt: Date;
}

export interface PasswordResetTokenRepository {
  hash(rawToken: string): string;
  /** Mints one token and invalidates every other live token that user holds. */
  issueFor(userId: Types.ObjectId, expiresAt: Date): Promise<IssuedResetToken>;
  findByHash(tokenHash: string): Promise<PasswordResetTokenRecord | null>;
  markUsed(id: Types.ObjectId, session?: DbSession): Promise<void>;
}

/** SHA-256, as `refreshtokens` uses: the input is machine entropy, so bcrypt cost buys nothing. */
const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

export const passwordResetTokenRepository: PasswordResetTokenRepository = {
  hash: sha256Hex,

  async issueFor(userId, expiresAt) {
    const rawToken = randomBytes(TOKEN_BYTES).toString('hex');

    // Invalidate before inserting, so two racing requests converge on "the later link works".
    await PasswordResetTokenModel.updateMany(
      { user: userId, usedAt: null, invalidatedAt: null },
      { $set: { invalidatedAt: new Date() } },
    ).exec();

    await PasswordResetTokenModel.create({ tokenHash: sha256Hex(rawToken), user: userId, expiresAt });

    return { rawToken, expiresAt };
  },

  async findByHash(tokenHash) {
    return PasswordResetTokenModel.findOne({ tokenHash }).lean<PasswordResetTokenRecord>().exec();
  },

  async markUsed(id, session) {
    const query = PasswordResetTokenModel.updateOne({ _id: id }, { $set: { usedAt: new Date() } });
    if (session) query.session(session);
    await query.exec();
  },

};
