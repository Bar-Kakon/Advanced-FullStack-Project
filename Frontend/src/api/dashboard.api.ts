import { isAxiosError } from 'axios';

import { api } from './client';
import type { ApiErrorBody } from './types';
import type { Dashboard, DashboardResponse, ProfileReminder, ProfileReminderResponse } from './dashboard.types';

export const fetchDashboard = async (): Promise<Dashboard> => {
  const { data } = await api.get<DashboardResponse>('/dashboard');
  return data.dashboard;
};

export const dismissProfileReminder = async (): Promise<ProfileReminder> => {
  const { data } = await api.post<ProfileReminderResponse>('/dashboard/profile-reminder/dismiss');
  return data.profileReminder;
};

export type DashboardFailure = 'UNAUTHENTICATED' | 'NOT_FOUND' | 'NETWORK' | 'UNKNOWN';

/** The no-response check comes first: an unreachable API must not read as a missing account. */
export const classifyDashboardError = (error: unknown): DashboardFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  const body = error.response.data as ApiErrorBody | undefined;
  switch (body?.code) {
    case 'UNAUTHENTICATED':
      return 'UNAUTHENTICATED';
    case 'USER_NOT_FOUND':
      return 'NOT_FOUND';
    default:
      return 'UNKNOWN';
  }
};
