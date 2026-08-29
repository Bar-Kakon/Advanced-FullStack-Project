import { isAxiosError } from 'axios';

import { api } from './client';
import type { ApiErrorBody } from './types';
import type {
  CreateProjectPayload,
  Project,
  ProjectPage,
  UpdateProjectPayload,
} from './projects.types';

export const listProjects = async (
  cursor: string | null,
  limit: number,
  signal?: AbortSignal,
): Promise<ProjectPage> => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);

  const { data } = await api.get<ProjectPage>('/projects', {
    params,
    ...(signal ? { signal } : {}),
  });
  return data;
};

export const fetchProject = async (projectId: string, signal?: AbortSignal): Promise<Project> => {
  const { data } = await api.get<{ project: Project }>(
    `/projects/${projectId}`,
    signal ? { signal } : {},
  );
  return data.project;
};

export const createProject = async (payload: CreateProjectPayload): Promise<Project> => {
  const { data } = await api.post<{ project: Project }>('/projects', payload);
  return data.project;
};

export const updateProject = async (
  projectId: string,
  payload: UpdateProjectPayload,
): Promise<Project> => {
  const { data } = await api.patch<{ project: Project }>(`/projects/${projectId}`, payload);
  return data.project;
};

/** Pre-start cancellation. The server refuses it once the project has started. */
export const cancelProject = async (projectId: string): Promise<void> => {
  await api.delete(`/projects/${projectId}`);
};

export type ProjectFailure =
  | 'NOT_FOUND'
  | 'NOT_PERMITTED'
  | 'NO_COMPANY'
  | 'TARGET_BEFORE_START'
  | 'OVERRUN_CEILING_EXCEEDED'
  | 'ALREADY_STARTED'
  | 'VALIDATION'
  | 'NETWORK'
  | 'UNKNOWN';

export const isAbortError = (error: unknown): boolean =>
  (isAxiosError(error) && error.code === 'ERR_CANCELED') ||
  (error instanceof Error && error.name === 'CanceledError');

/** The no-response check comes first: an unreachable API must not read as "not found". */
export const classifyProjectError = (error: unknown): ProjectFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  const body = error.response.data as ApiErrorBody | undefined;
  switch (body?.code) {
    case 'PROJECT_NOT_FOUND':
      return 'NOT_FOUND';
    case 'COMPANY_PERMISSION_DENIED':
      return 'NOT_PERMITTED';
    case 'NO_ACTIVE_COMPANY':
      return 'NO_COMPANY';
    case 'TARGET_BEFORE_START':
      return 'TARGET_BEFORE_START';
    case 'OVERRUN_CEILING_EXCEEDED':
      return 'OVERRUN_CEILING_EXCEEDED';
    case 'PROJECT_ALREADY_STARTED':
      return 'ALREADY_STARTED';
    case 'REQUEST_VALIDATION_FAILED':
      return 'VALIDATION';
    default:
      return 'UNKNOWN';
  }
};
