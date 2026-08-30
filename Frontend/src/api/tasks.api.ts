import { isAxiosError } from 'axios';

import { api } from './client';
import type { ApiErrorBody } from './types';
import { NO_PROJECT, type MyTask, type MyTasksFilters, type MyTasksPage } from './tasks.types';

const toParams = (filters: MyTasksFilters, cursor: string | null, limit: number): URLSearchParams => {
  const params = new URLSearchParams();
  // "All projects" and "No project" are two answers from one control, and the API takes one key.
  if (filters.projectId === NO_PROJECT) params.set('noProject', 'true');
  else if (filters.projectId) params.set('projectId', filters.projectId);
  if (filters.kind) params.set('kind', filters.kind);
  if (filters.state) params.set('state', filters.state);
  params.set('sort', filters.sort);
  params.set('limit', String(limit));
  if (cursor) params.set('cursor', cursor);
  return params;
};

export const listMyTasks = async (
  filters: MyTasksFilters,
  cursor: string | null,
  limit: number,
  signal?: AbortSignal,
): Promise<MyTasksPage> => {
  const { data } = await api.get<MyTasksPage>('/tasks', {
    params: toParams(filters, cursor, limit),
    ...(signal ? { signal } : {}),
  });
  return data;
};

export const startTask = async (taskId: string): Promise<MyTask> => {
  const { data } = await api.post<{ task: MyTask }>(`/tasks/${taskId}/start`);
  return data.task;
};

export const completeTask = async (taskId: string): Promise<MyTask> => {
  const { data } = await api.post<{ task: MyTask }>(`/tasks/${taskId}/complete`);
  return data.task;
};

export type TasksFailure =
  | 'NOT_FOUND'
  | 'NOT_THE_PERFORMER'
  | 'ALREADY'
  | 'ORPHANED'
  | 'NETWORK'
  | 'UNKNOWN';

export const classifyTasksError = (error: unknown): TasksFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  const body = error.response.data as ApiErrorBody | undefined;
  switch (body?.code) {
    case 'TASK_NOT_FOUND':
      return 'NOT_FOUND';
    case 'NOT_THE_PERFORMER':
      return 'NOT_THE_PERFORMER';
    case 'TASK_ALREADY_STARTED':
    case 'TASK_ALREADY_COMPLETED':
    case 'TASK_NOT_STARTED':
      return 'ALREADY';
    case 'TASK_ORPHANED':
      return 'ORPHANED';
    default:
      return 'UNKNOWN';
  }
};
