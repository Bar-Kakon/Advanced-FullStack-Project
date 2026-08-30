import { useCallback, useEffect, useRef, useState } from 'react';

import {
  classifyTasksError,
  completeTask,
  listMyTasks,
  startTask,
  type TasksFailure,
} from '../../api/tasks.api';
import { emptyTaskFilters, type MyTask, type MyTasksFilters } from '../../api/tasks.types';

const PAGE_SIZE = 20;

export const useMyTasks = () => {
  const [tasks, setTasks] = useState<readonly MyTask[] | null>(null);
  const [filters, setFilters] = useState<MyTasksFilters>(emptyTaskFilters);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<TasksFailure | null>(null);

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
      const page = await listMyTasks(filters, null, PAGE_SIZE);
      if (!mounted.current) return;
      setTasks(page.tasks);
      setCursor(page.nextCursor);
      setFailure(null);
    } catch (error) {
      if (!mounted.current) return;
      setFailure(classifyTasksError(error));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (cursor === null || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await listMyTasks(filters, cursor, PAGE_SIZE);
      if (!mounted.current) return;
      setTasks((current) => [...(current ?? []), ...page.tasks]);
      setCursor(page.nextCursor);
    } catch (error) {
      if (mounted.current) setFailure(classifyTasksError(error));
    } finally {
      if (mounted.current) setLoadingMore(false);
    }
  }, [cursor, filters, loadingMore]);

  /** Every report re-reads the server, so a row changes because the server changed it. */
  const report = useCallback(
    async (taskId: string, action: () => Promise<unknown>): Promise<void> => {
      if (busyId !== null) return;
      setBusyId(taskId);
      try {
        await action();
        if (mounted.current) setFailure(null);
      } catch (error) {
        if (mounted.current) setFailure(classifyTasksError(error));
      } finally {
        if (mounted.current) setBusyId(null);
      }
      await load();
    },
    [busyId, load],
  );

  return {
    tasks,
    filters,
    setFilters,
    loading,
    loadingMore,
    busyId,
    failure,
    hasMore: cursor !== null,
    reload: load,
    loadMore,
    start: (taskId: string) => report(taskId, () => startTask(taskId)),
    complete: (taskId: string) => report(taskId, () => completeTask(taskId)),
  };
};
