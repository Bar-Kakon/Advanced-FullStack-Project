import { Schema, model, type Types } from 'mongoose';

/**
 * Every kind of notification the platform raises, and nothing speculative beside them.
 *
 * `task.schedule_coordination` is deliberately absent. Coordinating a task's dates IS the proposal
 * flow, and it already has `proposal.awaiting_response` and `schedule.change_resolved`; a third
 * code would put two indistinguishable rows in front of the same person for one product event.
 */
export const NOTIFICATION_TYPES = [
  'project.invitation',
  'task.assigned',
  'task.updated',
  'task.early_completion',
  'proposal.awaiting_response',
  'proposal.returned_to_management',
  'schedule.change_resolved',
  'schedule.partial_release',
  'schedule.exception.awaiting_approval',
  'schedule.exception.modified',
  'schedule.exception.decided',
  'schedule.exception.affects_you',
  'responsibility.transfer_invited',
  'responsibility.transfer_accepted',
  'workplan.version_added',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export const NOTIFICATION_CLASSES = ['blocking', 'nonblocking'] as const;
export type NotificationClass = (typeof NOTIFICATION_CLASSES)[number];

/**
 * Blocking means an alert whose absence could stall work. It appears in-app immediately on every
 * plan, and it is never withheld for payment. Everything else aggregates into the digest.
 */
export const CLASS_OF: Readonly<Record<NotificationType, NotificationClass>> = {
  'project.invitation': 'blocking',
  'task.assigned': 'blocking',
  'task.updated': 'nonblocking',
  // Closed rule: early upstream completion reaches the GC on every tier, free. A digest-only
  // delivery would withhold it from Free, so it is blocking.
  'task.early_completion': 'blocking',
  'proposal.awaiting_response': 'blocking',
  'proposal.returned_to_management': 'blocking',
  'schedule.change_resolved': 'blocking',
  'schedule.partial_release': 'blocking',
  'schedule.exception.awaiting_approval': 'blocking',
  // The closed routing rule sends every modification back through the submitting professional, so
  // it is waiting on them rather than informing them.
  'schedule.exception.modified': 'blocking',
  'schedule.exception.decided': 'blocking',
  'schedule.exception.affects_you': 'blocking',
  'responsibility.transfer_invited': 'blocking',
  'responsibility.transfer_accepted': 'nonblocking',
  'workplan.version_added': 'nonblocking',
};

/**
 * What a row is allowed to carry.
 *
 * Deliberately a fixed, narrow set of scalars. There is no free-text field, so another
 * professional's decline reason, counter dates or written response have nowhere to be stored even
 * by mistake — the privacy rule is enforced by the shape rather than by remembering to strip.
 */
export interface NotificationPayload {
  readonly projectName?: string;
  readonly taskTitle?: string;
  readonly actorName?: string;
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly count?: number;
}

export interface NotificationRecord {
  readonly _id: Types.ObjectId;
  readonly user: Types.ObjectId;
  readonly type: NotificationType;
  readonly class: NotificationClass;
  readonly project?: Types.ObjectId;
  readonly task?: Types.ObjectId;
  readonly proposal?: Types.ObjectId;
  readonly scheduleException?: Types.ObjectId;
  readonly payload: NotificationPayload;
  /**
   * Whether the project was muted for this recipient when the event happened. The row is written
   * either way — a mute is a delivery preference, never a claim the event did not occur.
   */
  readonly mutedAtCreation: boolean;
  /** The single state a notification has. Unread is simply the absence of it. */
  readonly seenAt?: Date;
  /** One product event, one row per recipient. The unique index is what makes that true. */
  readonly dedupeKey: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const payloadSchema = new Schema(
  {
    projectName: { type: String, trim: true, maxlength: 200 },
    taskTitle: { type: String, trim: true, maxlength: 200 },
    actorName: { type: String, trim: true, maxlength: 200 },
    fromDate: { type: String, trim: true, maxlength: 10 },
    toDate: { type: String, trim: true, maxlength: 10 },
    count: { type: Number, min: 0 },
  },
  { _id: false },
);

const notificationSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    class: { type: String, enum: NOTIFICATION_CLASSES, required: true },

    project: { type: Schema.Types.ObjectId, ref: 'Project' },
    task: { type: Schema.Types.ObjectId, ref: 'Task' },
    proposal: { type: Schema.Types.ObjectId, ref: 'RescheduleProposal' },
    scheduleException: { type: Schema.Types.ObjectId, ref: 'ScheduleException' },

    payload: { type: payloadSchema, required: true, default: () => ({}) },
    mutedAtCreation: { type: Boolean, required: true, default: false },
    seenAt: { type: Date },
    dedupeKey: { type: String, required: true, trim: true, maxlength: 200 },
  },
  { timestamps: true },
);

// One row per recipient per product event. A second emit of the same event is a no-op, not a
// second line in somebody's list.
notificationSchema.index({ user: 1, dedupeKey: 1 }, { unique: true });
// The notification centre reads one person's list newest first, with `_id` breaking ties so a
// cursor never repeats a row.
notificationSchema.index({ user: 1, createdAt: -1, _id: -1 });
// The unread count, and the digest's "still relevant" sweep.
notificationSchema.index({ user: 1, seenAt: 1, class: 1, createdAt: -1 });

export const NotificationModel = model('Notification', notificationSchema);
