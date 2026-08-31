import { Types } from 'mongoose';

import type { EntitlementService } from '../billing/entitlements.service.js';
import type { NotificationPreferencePort } from '../mutes/notificationPreference.port.js';
import type { NotificationTimingRule } from '../users/user.model.js';
import {
  CLASS_OF,
  type NotificationPayload,
  type NotificationRecord,
  type NotificationType,
} from './notification.model.js';
import type { NotificationRepository } from './notification.repository.js';
import { EMAIL_GRACE_MINUTES } from './queuedEmail.model.js';
import type { QueuedEmailRepository } from './queuedEmail.repository.js';

const MINUTE_MS = 60_000;

/** One notification to raise for one person. The class is derived, never passed in. */
export interface NotificationEvent {
  readonly userId: Types.ObjectId;
  readonly type: NotificationType;
  readonly projectId?: Types.ObjectId;
  readonly taskId?: Types.ObjectId;
  readonly proposalId?: Types.ObjectId;
  readonly scheduleExceptionId?: Types.ObjectId;
  readonly payload?: NotificationPayload;
  /** Identifies the product event, so the same event twice is one row and not two. */
  readonly dedupeKey: string;
}

/** The narrow read of a person this service needs, so it never depends on the whole user domain. */
export interface NotificationRecipientReader {
  findDeliveryProfile(userId: string): Promise<{
    readonly operationalEmail: boolean;
    readonly timing: readonly NotificationTimingRule[];
  } | null>;
}

export interface NotificationDispatchService {
  emit(event: NotificationEvent): Promise<NotificationRecord | null>;
  emitMany(events: readonly NotificationEvent[]): Promise<number>;
}

export interface NotificationDispatchDependencies {
  readonly notifications: NotificationRepository;
  readonly emails: QueuedEmailRepository;
  readonly preferences: NotificationPreferencePort;
  readonly entitlements: EntitlementService;
  readonly recipients: NotificationRecipientReader;
}

/**
 * Where a quiet window pushes a send to, or the original time when none applies.
 *
 * A window that wraps past midnight is honoured, because 22:00–06:00 is the one people actually
 * ask for. Only the send time moves; nothing is dropped.
 */
export const applyQuietWindow = (
  at: Date,
  rules: readonly NotificationTimingRule[],
  notificationClass: 'blocking' | 'nonblocking',
): Date => {
  const rule = rules.find((row) => row.notificationClass === notificationClass);
  if (rule === undefined || rule.quietFromMinute === rule.quietToMinute) return at;

  const minute = at.getUTCHours() * 60 + at.getUTCMinutes();
  const wraps = rule.quietFromMinute > rule.quietToMinute;
  const inside = wraps
    ? minute >= rule.quietFromMinute || minute < rule.quietToMinute
    : minute >= rule.quietFromMinute && minute < rule.quietToMinute;
  if (!inside) return at;

  const released = new Date(at);
  released.setUTCHours(0, rule.quietToMinute, 0, 0);
  // A window that wraps releases on the following day whenever the current time is still before
  // midnight, which is exactly the case that ran past it.
  if (released.getTime() <= at.getTime()) released.setUTCDate(released.getUTCDate() + 1);
  return released;
};

/**
 * The one place the closed delivery rules are applied.
 *
 * A row is ALWAYS written. A mute is a delivery preference, so it changes which channels carry the
 * event, never whether the event happened — and the in-app blocking notice, which is free on every
 * plan, is never withheld by it. Email is queued only for a blocking event, only for somebody who
 * opted into operational email, only where the plan carries email at all, and only when the
 * project is not muted; it then waits out the 90-minute grace so that reading the in-app notice
 * cancels it.
 */
export const createNotificationDispatchService = ({
  notifications,
  emails,
  preferences,
  entitlements,
  recipients,
}: NotificationDispatchDependencies): NotificationDispatchService => {
  const emit = async (event: NotificationEvent): Promise<NotificationRecord | null> => {
    const userId = event.userId.toString();
    const notificationClass = CLASS_OF[event.type];

    const muted =
      event.projectId === undefined
        ? false
        : await preferences.isProjectMuted(userId, event.projectId.toString());

    const created = await notifications.create({
      user: event.userId,
      type: event.type,
      class: notificationClass,
      ...(event.projectId === undefined ? {} : { project: event.projectId }),
      ...(event.taskId === undefined ? {} : { task: event.taskId }),
      ...(event.proposalId === undefined ? {} : { proposal: event.proposalId }),
      ...(event.scheduleExceptionId === undefined
        ? {}
        : { scheduleException: event.scheduleExceptionId }),
      payload: event.payload ?? {},
      mutedAtCreation: muted,
      dedupeKey: event.dedupeKey,
    });
    // The same product event reaching the same person twice writes nothing the second time, and
    // must not queue a second email either.
    if (created === null) return null;

    if (notificationClass !== 'blocking' || muted) return created;

    const [profile, mayEmail] = await Promise.all([
      recipients.findDeliveryProfile(userId),
      entitlements.mayUse(userId, 'emailNotifications'),
    ]);
    if (profile === null || !profile.operationalEmail || !mayEmail) return created;

    const graceEnds = new Date(Date.now() + EMAIL_GRACE_MINUTES * MINUTE_MS);
    const mayControlTiming = await entitlements.mayUse(userId, 'notificationTimingControls');
    // Stored rules are ignored outright once the entitlement lapses, so a downgrade cannot leave a
    // paid-for quiet window silently in force.
    const sendAfter = mayControlTiming
      ? applyQuietWindow(graceEnds, profile.timing, notificationClass)
      : graceEnds;

    await emails.queue(created._id, event.userId, sendAfter);
    return created;
  };

  return {
    emit,

    async emitMany(events) {
      const results = await Promise.all(events.map((event) => emit(event)));
      return results.filter((row) => row !== null).length;
    },
  };
};
