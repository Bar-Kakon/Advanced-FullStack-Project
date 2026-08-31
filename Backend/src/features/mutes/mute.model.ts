import { Schema, model, type Types } from 'mongoose';

export const MUTE_SCOPES = ['contractor', 'project', 'conversation'] as const;
export type MuteScope = (typeof MUTE_SCOPES)[number];

export interface MuteRecord {
  readonly _id: Types.ObjectId;
  readonly user: Types.ObjectId;
  readonly scope: MuteScope;
  readonly target: Types.ObjectId;
  readonly createdAt: Date;
}

const muteSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    scope: { type: String, enum: MUTE_SCOPES, required: true },
    target: { type: Schema.Types.ObjectId, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

muteSchema.index({ user: 1, scope: 1, target: 1 }, { unique: true });

export const MuteModel = model('Mute', muteSchema);
