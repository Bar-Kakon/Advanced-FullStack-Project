import type {
  NotificationClass,
  NotificationPayload,
  NotificationType,
} from './notification.model.js';

/**
 * One row as a client sees it.
 *
 * There is exactly one state — `seenAt` — and unread is the absence of it. No second "read" or
 * "dismissed" concept exists, so a screen cannot show two statuses that disagree.
 *
 * The payload is the same narrow scalar set the model stores, which is why no other professional's
 * response, counter dates or decline reason can appear here: the shape has nowhere to put them.
 */
export interface NotificationDto {
  readonly id: string;
  readonly type: NotificationType;
  readonly notificationClass: NotificationClass;
  readonly projectId: string | null;
  readonly taskId: string | null;
  readonly proposalId: string | null;
  readonly scheduleExceptionId: string | null;
  readonly payload: NotificationPayload;
  /** True when the project was muted for this person as the event happened. */
  readonly muted: boolean;
  readonly seenAt: string | null;
  readonly createdAt: string;
}

export interface NotificationPageDto {
  readonly notifications: readonly NotificationDto[];
  readonly nextCursor: string | null;
  readonly unreadCount: number;
}
