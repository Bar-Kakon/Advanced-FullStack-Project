import { api } from './client';
import type { NotificationPage } from './notifications.types';

export const listNotifications = async (
  options: { cursor?: string | null; limit?: number; unreadOnly?: boolean },
  signal?: AbortSignal,
): Promise<NotificationPage> => {
  const { data } = await api.get<NotificationPage>('/notifications', {
    params: {
      ...(options.cursor ? { cursor: options.cursor } : {}),
      ...(options.limit === undefined ? {} : { limit: options.limit }),
      ...(options.unreadOnly ? { unreadOnly: true } : {}),
    },
    ...(signal ? { signal } : {}),
  });
  return data;
};

/** The navbar marker, kept to one small read rather than a page of rows. */
export const fetchUnreadCount = async (signal?: AbortSignal): Promise<number> => {
  const { data } = await api.get<{ unreadCount: number }>(
    '/notifications/unread-count',
    signal ? { signal } : {},
  );
  return data.unreadCount;
};

export const markNotificationsSeen = async (ids: readonly string[]): Promise<number> => {
  const { data } = await api.post<{ unreadCount: number }>('/notifications/seen', { ids });
  return data.unreadCount;
};

export const markAllNotificationsSeen = async (): Promise<number> => {
  const { data } = await api.post<{ unreadCount: number }>('/notifications/seen-all', {});
  return data.unreadCount;
};
