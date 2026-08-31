import { useCallback, useEffect, useState } from 'react';

import { fetchModerationQueue } from '../../api/moderation.api';
import type { ModerationQueueItem, ModerationReportStatus } from '../../api/moderation.types';

export type ModerationFailure = 'NOT_FOUND' | 'NETWORK' | 'UNKNOWN';

export const useModerationQueue = () => {
  const [status, setStatus] = useState<ModerationReportStatus | ''>('open');
  const [reports, setReports] = useState<readonly ModerationQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<ModerationFailure | null>(null);

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    setFailure(null);
    try {
      const page = await fetchModerationQueue(status === '' ? undefined : status);
      setReports(page.reports);
    } catch {
      setFailure('UNKNOWN');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  return { status, setStatus, reports, loading, failure, reload: load };
};
