import { isAxiosError } from 'axios';

import { api } from './client';
import type { ApiErrorBody } from './types';
import type {
  CreateOptions,
  CreateTaskPayload,
  CreateTaskResult,
  ProjectCreateOptions,
  StageOption,
} from './createTask.types';

export const fetchCreateOptions = async (signal?: AbortSignal): Promise<CreateOptions> => {
  const { data } = await api.get<CreateOptions>('/tasks/create-options', {
    ...(signal ? { signal } : {}),
  });
  return data;
};

export const fetchProjectCreateOptions = async (
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectCreateOptions> => {
  const { data } = await api.get<ProjectCreateOptions>(`/tasks/create-options/${projectId}`, {
    ...(signal ? { signal } : {}),
  });
  return data;
};

export const createTask = async (payload: CreateTaskPayload): Promise<CreateTaskResult> => {
  const { data } = await api.post<CreateTaskResult>('/tasks', payload);
  return data;
};

export const createStage = async (
  projectId: string,
  name: string,
  isGate: boolean,
): Promise<StageOption> => {
  const { data } = await api.post<{ stage: { _id: string; name: string; order: number; isGate: boolean } }>(
    `/projects/${projectId}/stages`,
    { name, isGate },
  );
  return {
    id: data.stage._id,
    name: data.stage.name,
    order: data.stage.order,
    isGate: data.stage.isGate,
  };
};

export type CreateTaskFailure =
  | 'NOT_FOUND'
  | 'CREATE_DENIED'
  | 'ASSIGN_DENIED'
  | 'STANDALONE_DENIED'
  | 'OUTSIDE_WINDOW'
  | 'DUE_BEFORE_START'
  | 'ASSIGNEE_NOT_MEMBER'
  | 'STAGE_NOT_FOUND'
  | 'INVALID_DATE'
  | 'NETWORK'
  | 'UNKNOWN';

export const classifyCreateTaskError = (error: unknown): CreateTaskFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  const body = error.response.data as ApiErrorBody | undefined;
  switch (body?.code) {
    case 'PROJECT_NOT_FOUND':
      return 'NOT_FOUND';
    case 'TASK_CREATE_DENIED':
      return 'CREATE_DENIED';
    case 'TASK_ASSIGN_DENIED':
      return 'ASSIGN_DENIED';
    case 'STANDALONE_CREATE_DENIED':
      return 'STANDALONE_DENIED';
    case 'TASK_OUTSIDE_PROJECT_WINDOW':
      return 'OUTSIDE_WINDOW';
    case 'DUE_BEFORE_START':
      return 'DUE_BEFORE_START';
    case 'ASSIGNEE_NOT_MEMBER':
      return 'ASSIGNEE_NOT_MEMBER';
    case 'STAGE_NOT_FOUND':
      return 'STAGE_NOT_FOUND';
    case 'INVALID_CALENDAR_DATE':
      return 'INVALID_DATE';
    default:
      return 'UNKNOWN';
  }
};
