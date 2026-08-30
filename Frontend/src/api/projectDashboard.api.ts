import { api } from './client';
import type { ProjectDashboard } from './projectDashboard.types';

export const fetchProjectDashboard = async (
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectDashboard> => {
  const { data } = await api.get<ProjectDashboard>(
    `/projects/${projectId}/dashboard`,
    signal ? { signal } : {},
  );
  return data;
};
