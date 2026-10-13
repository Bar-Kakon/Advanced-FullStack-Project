import { Schema, model, type Types } from 'mongoose';

/**
 * One row per issued account-recovery token. Only the SHA-256 hash is stored, never the token.
 *
 * Deliberately its own collection, apart from [[passwordresettokens]]: the two credentials open
 * different doors, and keeping them in separate collections is what makes a reset token unable to
 * restore an account — and the reverse — by construction rather than by a purpose flag.
 */
export interface AccountRecoveryTokenRecord {
  readonly _id: Types.ObjectId;
  readonly tokenHash: string;
  readonly user: Types.ObjectId;
  readonly expiresAt: Date;
  /** Set when a restoration spent it. One-time use is this staying null. */
  readonly usedAt: Date | null;
  /** Set when a newer request replaced it. Distinct from having been spent. */
  readonly invalidatedAt: Date | null;
}

const accountRecoveryTokenSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    invalidatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Housekeeping only. The restore path checks `expiresAt` itself, because the TTL monitor runs
// about once a minute and a token must be dead the second it expires.
accountRecoveryTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const AccountRecoveryTokenModel = model('AccountRecoveryToken', accountRecoveryTokenSchema);
