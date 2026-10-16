import { api } from './client';
import type {
  DelegationScope,
  PrivateItemKind,
  PrivateWorkItem,
  TaskDetail,
} from './taskDetail.types';

export const fetchTaskDetail = async (taskId: string, signal?: AbortSignal): Promise<TaskDetail> => {
  const { data } = await api.get<{ task: TaskDetail }>(`/tasks/${taskId}`, signal ? { signal } : {});
  return data.task;
};

export const delegateTask = async (
  taskId: string,
  payload: { userId: string; scope: DelegationScope; partDescription?: string },
): Promise<TaskDetail> => {
  const { data } = await api.post<{ task: TaskDetail }>(`/tasks/${taskId}/delegation`, payload);
  return data.task;
};

export const endDelegation = async (taskId: string): Promise<TaskDetail> => {
  const { data } = await api.delete<{ task: TaskDetail }>(`/tasks/${taskId}/delegation`);
  return data.task;
};

export const fetchPrivateWork = async (
  taskId: string,
  signal?: AbortSignal,
): Promise<readonly PrivateWorkItem[]> => {
  const { data } = await api.get<{ items: PrivateWorkItem[] }>(
    `/tasks/${taskId}/private`,
    signal ? { signal } : {},
  );
  return data.items;
};

export const addPrivateItem = async (
  taskId: string,
  kind: PrivateItemKind,
  body: string,
): Promise<PrivateWorkItem> => {
  const { data } = await api.post<{ item: PrivateWorkItem }>(`/tasks/${taskId}/private`, { kind, body });
  return data.item;
};

export const startPrivateItem = async (taskId: string, itemId: string): Promise<PrivateWorkItem> => {
  const { data } = await api.post<{ item: PrivateWorkItem }>(`/tasks/${taskId}/private/${itemId}/start`);
  return data.item;
};

export const completePrivateItem = async (taskId: string, itemId: string): Promise<PrivateWorkItem> => {
  const { data } = await api.post<{ item: PrivateWorkItem }>(`/tasks/${taskId}/private/${itemId}/complete`);
  return data.item;
};

export const updatePrivateItem = async (
  taskId: string,
  itemId: string,
  body: string,
): Promise<PrivateWorkItem> => {
  const { data } = await api.patch<{ item: PrivateWorkItem }>(
    `/tasks/${taskId}/private/${itemId}/body`,
    { body },
  );
  return data.item;
};

export const removePrivateItem = async (taskId: string, itemId: string): Promise<void> => {
  await api.delete(`/tasks/${taskId}/private/${itemId}`);
};
