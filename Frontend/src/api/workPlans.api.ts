import { api } from './client';
import type { WorkPlan, WorkPlanVisibility } from './workPlans.types';

export const fetchTaskWorkPlans = async (taskId: string, signal?: AbortSignal): Promise<readonly WorkPlan[]> => {
  const { data } = await api.get<{ plans: WorkPlan[] }>(`/work-plans/task/${taskId}`, signal ? { signal } : {});
  return data.plans;
};

export const fetchWorkPlanVersions = async (planId: string): Promise<readonly WorkPlan[]> => {
  const { data } = await api.get<{ versions: WorkPlan[] }>(`/work-plans/${planId}/versions`);
  return data.versions;
};

const withFile = (file: File, visibility?: WorkPlanVisibility): FormData => {
  const body = new FormData();
  body.append('plan', file);
  if (visibility !== undefined) body.append('visibility', visibility);
  return body;
};

export const uploadTaskWorkPlan = async (
  taskId: string,
  file: File,
  visibility: WorkPlanVisibility,
): Promise<WorkPlan> => {
  const { data } = await api.post<{ plan: WorkPlan }>(`/work-plans/task/${taskId}`, withFile(file, visibility));
  return data.plan;
};

/** A new version inherits the plan's visibility; the server refuses to take it again from here. */
export const uploadWorkPlanVersion = async (planId: string, file: File): Promise<WorkPlan> => {
  const { data } = await api.post<{ plan: WorkPlan }>(`/work-plans/${planId}/versions`, withFile(file));
  return data.plan;
};

export const markWorkPlanVersionCurrent = async (
  planId: string,
  version: number,
): Promise<readonly WorkPlan[]> => {
  const { data } = await api.post<{ versions: WorkPlan[] }>(`/work-plans/${planId}/current`, { version });
  return data.versions;
};
