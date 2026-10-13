import { useCallback, useEffect, useRef, useState } from 'react';

import {
  listNotifications,
  markAllNotificationsSeen,
  markNotificationsSeen,
} from '../../api/notifications.api';
import type { AppNotification } from '../../api/notifications.types';
import { useAppDispatch } from '../../store/hooks';
import { unreadNotificationsSet } from '../../store/sessionSlice';

const PAGE_SIZE = 20;

export type NotificationsFailure = 'network' | 'load';

const classify = (error: unknown): NotificationsFailure =>
  (error as { response?: unknown }).response === undefined ? 'network' : 'load';

export const useNotifications = () => {
  const dispatch = useAppDispatch();
  const [notifications, setNotifications] = useState<readonly AppNotification[] | null>(null);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [cursor, setCursor] = useState<string | null>(null);
  const [unreadCount, setUnreadCountState] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failure, setFailure] = useState<NotificationsFailure | null>(null);

  const setUnreadCount = useCallback(
    (count: number): void => {
      setUnreadCountState(count);
      dispatch(unreadNotificationsSet(count));
    },
    [dispatch],
  );

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const page = await listNotifications({ limit: PAGE_SIZE, unreadOnly });
      if (!mounted.current) return;
      setNotifications(page.notifications);
      setCursor(page.nextCursor);
      setUnreadCount(page.unreadCount);
      setFailure(null);
    } catch (error) {
      if (mounted.current) setFailure(classify(error));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [unreadOnly, setUnreadCount]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Appends rather than replaces, so the rows already on screen do not move under the reader. */
  const loadMore = useCallback(async (): Promise<void> => {
    if (cursor === null) return;
    setLoadingMore(true);
    try {
      const page = await listNotifications({ limit: PAGE_SIZE, cursor, unreadOnly });
      if (!mounted.current) return;
      setNotifications((held) => [...(held ?? []), ...page.notifications]);
      setCursor(page.nextCursor);
      setUnreadCount(page.unreadCount);
    } catch (error) {
      if (mounted.current) setFailure(classify(error));
    } finally {
      if (mounted.current) setLoadingMore(false);
    }
  }, [cursor, unreadOnly, setUnreadCount]);

  /**
   * Marks one row and stamps it locally. Seeing a notification is what cancels its queued email,
   * so this is a real action rather than a display concern.
   */
  const markSeen = useCallback(async (id: string): Promise<void> => {
    const stamp = new Date().toISOString();
    setNotifications((held) =>
      (held ?? []).map((row) => (row.id === id && row.seenAt === null ? { ...row, seenAt: stamp } : row)),
    );
    try {
      const left = await markNotificationsSeen([id]);
      if (mounted.current) setUnreadCount(left);
    } catch (error) {
      if (mounted.current) setFailure(classify(error));
    }
  }, [setUnreadCount]);

  const markAllSeen = useCallback(async (): Promise<void> => {
    const stamp = new Date().toISOString();
    setNotifications((held) =>
      (held ?? []).map((row) => (row.seenAt === null ? { ...row, seenAt: stamp } : row)),
    );
    try {
      const left = await markAllNotificationsSeen();
      if (mounted.current) setUnreadCount(left);
    } catch (error) {
      if (mounted.current) setFailure(classify(error));
    }
  }, [setUnreadCount]);

  return {
    notifications,
    unreadOnly,
    setUnreadOnly,
    unreadCount,
    hasMore: cursor !== null,
    loading,
    loadingMore,
    failure,
    loadMore,
    markSeen,
    markAllSeen,
    reload: load,
  };
};
