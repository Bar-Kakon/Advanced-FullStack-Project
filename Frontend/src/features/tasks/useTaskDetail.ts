import { useCallback, useEffect, useRef, useState } from 'react';

import { classifyTasksError, type TasksFailure } from '../../api/tasks.api';
import {
  addPrivateItem,
  delegateTask,
  endDelegation,
  fetchPrivateWork,
  fetchTaskDetail,
  removePrivateItem,
  togglePrivateItem,
} from '../../api/taskDetail.api';
import type {
  DelegationScope,
  PrivateItemKind,
  PrivateWorkItem,
  TaskDetail,
} from '../../api/taskDetail.types';

export const useTaskDetail = (taskId: string) => {
  const [task, setTask] = useState<TaskDetail | null>(null);
  const [privateItems, setPrivateItems] = useState<readonly PrivateWorkItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
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
      const next = await fetchTaskDetail(taskId);
      if (!mounted.current) return;
      setTask(next);
      setFailure(null);
      // The private layer is a second read: only its owner is allowed it, so a refusal is normal.
      try {
        setPrivateItems(await fetchPrivateWork(taskId));
      } catch {
        setPrivateItems([]);
      }
    } catch (error) {
      if (!mounted.current) return;
      setTask(null);
      setFailure(classifyTasksError(error));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (action: () => Promise<unknown>): Promise<void> => {
      if (busy) return;
      setBusy(true);
      try {
        await action();
        if (mounted.current) setFailure(null);
      } catch (error) {
        if (mounted.current) setFailure(classifyTasksError(error));
      } finally {
        if (mounted.current) setBusy(false);
      }
      await load();
    },
    [busy, load],
  );

  return {
    task,
    privateItems,
    loading,
    busy,
    failure,
    reload: load,
    delegate: (payload: { userId: string; scope: DelegationScope; partDescription?: string }) =>
      run(() => delegateTask(taskId, payload)),
    endDelegation: () => run(() => endDelegation(taskId)),
    addPrivate: (kind: PrivateItemKind, body: string) => run(() => addPrivateItem(taskId, kind, body)),
    togglePrivate: (itemId: string, done: boolean) => run(() => togglePrivateItem(taskId, itemId, done)),
    removePrivate: (itemId: string) => run(() => removePrivateItem(taskId, itemId)),
  };
};
