import { useCallback, useEffect, useState } from 'react';

import { fetchPlatformAudit } from '../../api/moderation.api';
import type {
  PlatformAuditAction,
  PlatformAuditRow,
  PlatformAuditTargetType,
} from '../../api/moderation.types';

export interface AuditLogState {
  readonly rows: readonly PlatformAuditRow[];
  readonly loading: boolean;
  readonly loadingMore: boolean;
  readonly failure: boolean;
  readonly hasMore: boolean;
  readonly action: PlatformAuditAction | '';
  readonly targetType: PlatformAuditTargetType | '';
  setAction(next: PlatformAuditAction | ''): void;
  setTargetType(next: PlatformAuditTargetType | ''): void;
  loadMore(): void;
}

/**
 * The trail is append-only and newest-first, so a page already fetched can never change. Changing
 * a filter therefore restarts the listing rather than merging into what is on screen.
 */
export const useAuditLog = (): AuditLogState => {
  const [rows, setRows] = useState<readonly PlatformAuditRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failure, setFailure] = useState(false);
  const [action, setAction] = useState<PlatformAuditAction | ''>('');
  const [targetType, setTargetType] = useState<PlatformAuditTargetType | ''>('');

  useEffect(() => {
    let current = true;
    setLoading(true);
    setFailure(false);

    void fetchPlatformAudit({
      ...(action === '' ? {} : { action }),
      ...(targetType === '' ? {} : { targetType }),
    })
      .then((page) => {
        if (!current) return;
        setRows(page.rows);
        setCursor(page.nextCursor);
      })
      .catch(() => {
        if (current) setFailure(true);
      })
      .finally(() => {
        if (current) setLoading(false);
      });

    // A superseded filter's answer is discarded rather than rendered over the current one.
    return () => {
      current = false;
    };
  }, [action, targetType]);

  const loadMore = useCallback(() => {
    if (cursor === null || loadingMore) return;

    setLoadingMore(true);
    void fetchPlatformAudit({
      ...(action === '' ? {} : { action }),
      ...(targetType === '' ? {} : { targetType }),
      cursor,
    })
      .then((page) => {
        setRows((previous) => [...previous, ...page.rows]);
        setCursor(page.nextCursor);
      })
      .catch(() => setFailure(true))
      .finally(() => setLoadingMore(false));
  }, [action, cursor, loadingMore, targetType]);

  return {
    rows,
    loading,
    loadingMore,
    failure,
    hasMore: cursor !== null,
    action,
    targetType,
    setAction,
    setTargetType,
    loadMore,
  };
};
