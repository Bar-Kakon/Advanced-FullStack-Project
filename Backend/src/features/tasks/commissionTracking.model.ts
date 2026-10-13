import { Schema, model, type Types } from 'mongoose';

export const TRACKING_ARRANGEMENTS = ['owner_only', 'transferred', 'shared'] as const;
export type TrackingArrangement = (typeof TRACKING_ARRANGEMENTS)[number];

/**
 * One explicitly arranged tracking responsibility for one commissioned task. Absence of a row is
 * not an error — it means the responsibility precedence falls through to the company default and
 * finally to the owner. The agreement message stays the authoritative record of attribution.
 */
export interface CommissionTrackingRecord {
  readonly _id: Types.ObjectId;
  readonly task: Types.ObjectId;
  readonly company: Types.ObjectId;
  /** The original commissioner — display convenience, never attribution. */
  readonly commissionedBy: Types.ObjectId;
  readonly arrangement: TrackingArrangement;
  readonly trackee?: Types.ObjectId;
  readonly assignedBy: Types.ObjectId;
  readonly assignedAt: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const commissionTrackingSchema = new Schema(
  {
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true, unique: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    commissionedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    arrangement: { type: String, enum: TRACKING_ARRANGEMENTS, required: true },
    trackee: { type: Schema.Types.ObjectId, ref: 'User' },
    assignedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    assignedAt: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: true },
);

// The trackee's own read: everything arranged onto them.
commissionTrackingSchema.index({ trackee: 1 });

export const CommissionTrackingModel = model('CommissionTracking', commissionTrackingSchema);
