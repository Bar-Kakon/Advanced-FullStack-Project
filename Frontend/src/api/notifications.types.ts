/**
 * The notification centre's shapes, mirroring the server's DTO exactly.
 *
 * There is one state — `seenAt` — and unread is the absence of it. No second read or dismissed
 * concept exists on either side, so a screen cannot show two statuses that disagree.
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

export type NotificationClass = 'blocking' | 'nonblocking';

/** The narrow scalar set the server stores. No free-text field exists to carry anyone's response. */
export interface NotificationPayload {
  readonly projectName?: string;
  readonly taskTitle?: string;
  readonly actorName?: string;
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly count?: number;
}

export interface AppNotification {
  readonly id: string;
  readonly type: NotificationType;
  readonly notificationClass: NotificationClass;
  readonly projectId: string | null;
  readonly taskId: string | null;
  readonly proposalId: string | null;
  readonly scheduleExceptionId: string | null;
  readonly payload: NotificationPayload;
  readonly muted: boolean;
  readonly seenAt: string | null;
  readonly createdAt: string;
}

export interface NotificationPage {
  readonly notifications: readonly AppNotification[];
  readonly nextCursor: string | null;
  readonly unreadCount: number;
}
