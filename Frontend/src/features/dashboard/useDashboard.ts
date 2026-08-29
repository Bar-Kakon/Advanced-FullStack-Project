import { useCallback, useEffect, useRef, useState } from 'react';

import {
  classifyDashboardError,
  dismissProfileReminder,
  fetchDashboard,
  type DashboardFailure,
} from '../../api/dashboard.api';
import type { Dashboard } from '../../api/dashboard.types';

export const useDashboard = () => {
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<DashboardFailure | null>(null);
  const [dismissing, setDismissing] = useState(false);

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
      const next = await fetchDashboard();
      if (!mounted.current) return;
      setDashboard(next);
      setFailure(null);
    } catch (error) {
      if (!mounted.current) return;
      setFailure(classifyDashboardError(error));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const dismiss = useCallback(async (): Promise<void> => {
    if (dismissing) return;
    setDismissing(true);
    try {
      const profileReminder = await dismissProfileReminder();
      if (!mounted.current) return;
      setDashboard((current) => (current === null ? current : { ...current, profileReminder }));
    } catch (error) {
      if (!mounted.current) return;
      setFailure(classifyDashboardError(error));
    } finally {
      if (mounted.current) setDismissing(false);
    }
  }, [dismissing]);

  return { dashboard, loading, failure, dismissing, reload: load, dismiss };
};
