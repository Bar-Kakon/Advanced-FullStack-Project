import { useCallback, useEffect, useRef, useState } from 'react';

import { classifyProjectError, listProjects, type ProjectFailure } from '../../api/projects.api';
import type { Project } from '../../api/projects.types';

const PAGE_SIZE = 20;

export const useProjects = () => {
  const [projects, setProjects] = useState<readonly Project[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failure, setFailure] = useState<ProjectFailure | null>(null);

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
      const page = await listProjects(null, PAGE_SIZE);
      if (!mounted.current) return;
      setProjects(page.projects);
      setCursor(page.nextCursor);
      setFailure(null);
    } catch (error) {
      if (!mounted.current) return;
      setFailure(classifyProjectError(error));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listProjects(cursor, PAGE_SIZE);
      if (!mounted.current) return;
      setProjects((current) => [...(current ?? []), ...page.projects]);
      setCursor(page.nextCursor);
    } catch (error) {
      if (!mounted.current) return;
      setFailure(classifyProjectError(error));
    } finally {
      if (mounted.current) setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

  return { projects, loading, loadingMore, failure, hasMore: cursor !== null, reload: load, loadMore };
};
