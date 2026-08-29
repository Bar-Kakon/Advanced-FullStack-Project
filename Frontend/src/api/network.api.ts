import { isAxiosError } from 'axios';

import { api } from './client';
import type { ApiErrorBody } from './types';
import type { BlockedPage, NetworkGroup, NetworkPage } from './network.types';

export const fetchNetworkGroup = async (
  group: NetworkGroup,
  cursor: string | null,
  limit: number,
  signal?: AbortSignal,
): Promise<NetworkPage> => {
  const params = new URLSearchParams({ group, limit: String(limit) });
  if (cursor) params.set('cursor', cursor);

  const { data } = await api.get<NetworkPage>('/network/connections', {
    params,
    ...(signal ? { signal } : {}),
  });
  return data;
};

export const fetchMyBlocks = async (
  cursor: string | null,
  limit: number,
  signal?: AbortSignal,
): Promise<BlockedPage> => {
  const params = new URLSearchParams({ limit: String(limit) });
  if (cursor) params.set('cursor', cursor);

  const { data } = await api.get<BlockedPage>('/network/blocks', {
    params,
    ...(signal ? { signal } : {}),
  });
  return data;
};

export const acceptConnection = async (userId: string): Promise<void> => {
  await api.post(`/connections/${userId}/accept`);
};

export const declineConnection = async (userId: string): Promise<void> => {
  await api.post(`/connections/${userId}/decline`);
};

export const withdrawConnection = async (userId: string): Promise<void> => {
  await api.post(`/connections/${userId}/withdraw`);
};

export const removeConnection = async (userId: string): Promise<void> => {
  await api.post(`/connections/${userId}/remove`);
};

export const unblockUser = async (userId: string): Promise<void> => {
  await api.delete(`/blocks/${userId}`);
};

export type NetworkFailure = 'STALE' | 'UNAUTHENTICATED' | 'NETWORK' | 'UNKNOWN';

/** A 404 here means the screen is behind, not that the action failed for a real reason. */
export const classifyNetworkError = (error: unknown): NetworkFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  const body = error.response.data as ApiErrorBody | undefined;
  switch (body?.code) {
    case 'CONNECTION_REQUEST_NOT_FOUND':
    case 'NOT_CONNECTED':
    case 'BLOCK_NOT_FOUND':
      return 'STALE';
    case 'UNAUTHENTICATED':
      return 'UNAUTHENTICATED';
    default:
      return 'UNKNOWN';
  }
};
