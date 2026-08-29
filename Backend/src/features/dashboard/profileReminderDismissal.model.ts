import { Schema, model, type Types } from 'mongoose';

export const PROFILE_REMINDER_MODEL_VERSION = 1;

export interface ProfileReminderDismissalRecord {
  readonly _id: Types.ObjectId;
  readonly user: Types.ObjectId;
  readonly version: number;
  readonly dismissedKeys: readonly string[];
  readonly dismissedAt: Date;
}

const profileReminderDismissalSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    version: { type: Number, required: true },
    dismissedKeys: [{ type: String, required: true }],
    dismissedAt: { type: Date, required: true },
  },
  { timestamps: true },
);

profileReminderDismissalSchema.index(
  { user: 1 },
  { unique: true, name: 'profile_reminder_dismissal_user_unique' },
);

export const ProfileReminderDismissalModel = model(
  'ProfileReminderDismissal',
  profileReminderDismissalSchema,
);