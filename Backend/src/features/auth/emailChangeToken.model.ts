import { Schema, model, type Types } from 'mongoose';

export interface EmailChangeTokenRecord {
  readonly _id: Types.ObjectId;
  readonly tokenHash: string;
  readonly user: Types.ObjectId;
  readonly newEmail: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly invalidatedAt: Date | null;
}

const emailChangeTokenSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    newEmail: { type: String, required: true, lowercase: true, trim: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
    invalidatedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

emailChangeTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailChangeTokenModel = model('EmailChangeToken', emailChangeTokenSchema);
