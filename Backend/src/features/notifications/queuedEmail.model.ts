import { Schema, model, type Types } from 'mongoose';

/**
 * One blocking notification's email, held back for the grace window.
 *
 * The closed rule: a blocking event appears in-app at once and does NOT email at once. It opens a
 * 90-minute window, and if the in-app notice is seen inside that window the queued email is
 * cancelled. So the email is a second attempt at reaching somebody who has not looked, never a
 * duplicate of something they already read.
 *
 * Non-blocking events are never queued here at all — they aggregate into the daily digest.
 */
export const EMAIL_GRACE_MINUTES = 90;

export const QUEUED_EMAIL_STATUSES = ['queued', 'sent', 'cancelled', 'failed'] as const;
export type QueuedEmailStatus = (typeof QUEUED_EMAIL_STATUSES)[number];

/** Why a queued email never went out. `seen` is the rule working, not an error. */
export const CANCEL_REASONS = ['seen', 'opted_out', 'not_entitled'] as const;
export type CancelReason = (typeof CANCEL_REASONS)[number];

export interface QueuedEmailRecord {
  readonly _id: Types.ObjectId;
  readonly notification: Types.ObjectId;
  readonly user: Types.ObjectId;
  /** When the grace window closes. Nothing is sent before it. */
  readonly sendAfter: Date;
  readonly status: QueuedEmailStatus;
  readonly cancelReason?: CancelReason;
  readonly sentAt?: Date;
  readonly cancelledAt?: Date;
  readonly attempts: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const queuedEmailSchema = new Schema(
  {
    notification: { type: Schema.Types.ObjectId, ref: 'Notification', required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sendAfter: { type: Date, required: true },
    status: { type: String, enum: QUEUED_EMAIL_STATUSES, required: true, default: 'queued' },
    cancelReason: { type: String, enum: CANCEL_REASONS },
    sentAt: { type: Date },
    cancelledAt: { type: Date },
    attempts: { type: Number, required: true, default: 0, min: 0 },
  },
  { timestamps: true },
);

// The worker's only query: what is due and still queued.
queuedEmailSchema.index({ status: 1, sendAfter: 1 });

export const QueuedEmailModel = model('QueuedEmail', queuedEmailSchema);
