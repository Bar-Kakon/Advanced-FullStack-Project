import { Schema, model, type Types } from 'mongoose';

/**
 * One row per issued Refresh Token. Only the SHA-256 hash is stored — the same stance
 * `docs/database-design.html` already takes for password-reset tokens, so a database leak yields
 * nothing that can be replayed.
 */
export interface RefreshTokenRecord {
  readonly _id: Types.ObjectId;
  readonly tokenHash: string;
  readonly user: Types.ObjectId;
  readonly family: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly revokedAt: Date | null;
}

const refreshTokenSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// TTL: MongoDB removes a row once `expiresAt` passes, so the collection cannot grow without bound.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RefreshTokenModel = model('RefreshToken', refreshTokenSchema);
