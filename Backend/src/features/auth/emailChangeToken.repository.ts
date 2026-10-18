import { createHash, randomBytes } from 'node:crypto';

import type { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import { EmailChangeTokenModel, type EmailChangeTokenRecord } from './emailChangeToken.model.js';

const TOKEN_BYTES = 32;

const LIVE = { usedAt: null, invalidatedAt: null } as const;

export interface IssuedEmailChangeToken {
  readonly rawToken: string;
  readonly expiresAt: Date;
}

export interface PendingEmailChange {
  readonly newEmail: string;
  readonly expiresAt: Date;
}

export interface EmailChangeTokenRepository {
  hash(rawToken: string): string;
  /** Mints one token and invalidates every other live token that user holds. */
  issueFor(userId: Types.ObjectId, newEmail: string, expiresAt: Date): Promise<IssuedEmailChangeToken>;
  findByHash(tokenHash: string): Promise<EmailChangeTokenRecord | null>;
  findPendingFor(userId: Types.ObjectId): Promise<PendingEmailChange | null>;
  /** Spends a live, unexpired token. `false` when it was already spent, replaced or expired. */
  claim(id: Types.ObjectId, session: DbSession): Promise<boolean>;
  invalidateAllFor(userId: Types.ObjectId, session?: DbSession): Promise<void>;
}

const sha256Hex = (value: string): string => createHash('sha256').update(value).digest('hex');

export const emailChangeTokenRepository: EmailChangeTokenRepository = {
  hash: sha256Hex,

  async issueFor(userId, newEmail, expiresAt) {
    const rawToken = randomBytes(TOKEN_BYTES).toString('hex');

    await EmailChangeTokenModel.updateMany(
      { user: userId, ...LIVE },
      { $set: { invalidatedAt: new Date() } },
    ).exec();

    await EmailChangeTokenModel.create({
      tokenHash: sha256Hex(rawToken),
      user: userId,
      newEmail,
      expiresAt,
    });

    return { rawToken, expiresAt };
  },

  async findByHash(tokenHash) {
    return EmailChangeTokenModel.findOne({ tokenHash }).lean<EmailChangeTokenRecord>().exec();
  },

  async findPendingFor(userId) {
    const found = await EmailChangeTokenModel.findOne({
      user: userId,
      ...LIVE,
      expiresAt: { $gt: new Date() },
    })
      .sort({ createdAt: -1 })
      .select('newEmail expiresAt')
      .lean<{ newEmail: string; expiresAt: Date }>()
      .exec();

    return found === null ? null : { newEmail: found.newEmail, expiresAt: found.expiresAt };
  },

  async claim(id, session) {
    const result = await EmailChangeTokenModel.updateOne(
      { _id: id, ...LIVE, expiresAt: { $gt: new Date() } },
      { $set: { usedAt: new Date() } },
    )
      .session(session)
      .exec();

    return result.modifiedCount === 1;
  },

  async invalidateAllFor(userId, session) {
    const query = EmailChangeTokenModel.updateMany(
      { user: userId, ...LIVE },
      { $set: { invalidatedAt: new Date() } },
    );
    if (session) query.session(session);
    await query.exec();
  },
};
