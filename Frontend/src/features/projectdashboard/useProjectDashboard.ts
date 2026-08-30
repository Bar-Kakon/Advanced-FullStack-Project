import { useCallback, useEffect, useRef, useState } from 'react';

import { isAxiosError } from 'axios';

import { fetchProjectDashboard } from '../../api/projectDashboard.api';
import type { ProjectDashboard } from '../../api/projectDashboard.types';

export type DashboardFailure = 'NOT_FOUND' | 'NETWORK' | 'UNKNOWN';

const classify = (error: unknown): DashboardFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';
  // A project this account may not reach and one that does not exist answer identically (D16).
  return error.response.status === 404 ? 'NOT_FOUND' : 'UNKNOWN';
};

export const useProjectDashboard = (projectId: string) => {
  const [data, setData] = useState<ProjectDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [failure, setFailure] = useState<DashboardFailure | null>(null);

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
      const next = await fetchProjectDashboard(projectId);
      if (!mounted.current) return;
      setData(next);
      setFailure(null);
    } catch (error) {
      if (!mounted.current) return;
      setData(null);
      setFailure(classify(error));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { data, loading, failure, reload: load };
};
