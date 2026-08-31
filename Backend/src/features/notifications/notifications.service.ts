import { Types } from 'mongoose';

import type { NotificationRecord } from './notification.model.js';
import type { NotificationDto, NotificationPageDto } from './notification.dto.js';
import type { NotificationRepository } from './notification.repository.js';
import type { QueuedEmailRepository } from './queuedEmail.repository.js';

export const NOTIFICATIONS_DEFAULT_LIMIT = 20;
export const NOTIFICATIONS_MAX_LIMIT = 50;

export interface NotificationsService {
  list(
    userId: string,
    options: { limit: number; cursor: string | null; unreadOnly: boolean },
  ): Promise<NotificationPageDto>;
  unreadCount(userId: string): Promise<number>;
  markSeen(userId: string, ids: readonly string[]): Promise<NotificationPageDto['unreadCount']>;
  markAllSeen(userId: string): Promise<number>;
}

export interface NotificationsDependencies {
  readonly notifications: NotificationRepository;
  readonly emails: QueuedEmailRepository;
}

export const toNotificationDto = (row: NotificationRecord): NotificationDto => ({
  id: row._id.toString(),
  type: row.type,
  notificationClass: row.class,
  projectId: row.project?.toString() ?? null,
  taskId: row.task?.toString() ?? null,
  proposalId: row.proposal?.toString() ?? null,
  scheduleExceptionId: row.scheduleException?.toString() ?? null,
  payload: row.payload,
  muted: row.mutedAtCreation,
  seenAt: row.seenAt?.toISOString() ?? null,
  createdAt: row.createdAt.toISOString(),
});

export const createNotificationsService = ({
  notifications,
  emails,
}: NotificationsDependencies): NotificationsService => {
  /**
   * Seeing a notification cancels the email it queued. This is the direct path the closed rule
   * describes; the worker re-checks as well, so a cancellation is never lost to a race.
   */
  const cancelEmailsFor = async (moved: readonly Types.ObjectId[]): Promise<void> => {
    if (moved.length > 0) await emails.cancelFor(moved, 'seen');
  };

  return {
    async list(userId, { limit, cursor, unreadOnly }) {
      const user = new Types.ObjectId(userId);
      const [page, unreadCount] = await Promise.all([
        notifications.page(user, limit, cursor, unreadOnly),
        notifications.unreadCount(user),
      ]);

      return {
        notifications: page.rows.map(toNotificationDto),
        nextCursor: page.nextCursor,
        unreadCount,
      };
    },

    async unreadCount(userId) {
      return notifications.unreadCount(new Types.ObjectId(userId));
    },

    /** Scoped to the caller's own rows, so naming somebody else's id marks nothing. */
    async markSeen(userId, ids) {
      const user = new Types.ObjectId(userId);
      const valid = ids.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));

      await cancelEmailsFor(await notifications.markSeen(user, valid));
      return notifications.unreadCount(user);
    },

    async markAllSeen(userId) {
      const user = new Types.ObjectId(userId);

      await cancelEmailsFor(await notifications.markAllSeen(user));
      return notifications.unreadCount(user);
    },
  };
};
