import { isAxiosError } from 'axios';

import { api } from './client';
import type { WorkingCalendarConfig } from './projects.types';
import type { ApiErrorBody } from './types';

export interface CompanyCalendarVersion {
  readonly versionId: string;
  readonly version: number;
  readonly config: WorkingCalendarConfig;
  readonly createdAt: string;
}

export interface CompanyCalendar {
  readonly current: {
    readonly versionId: string | null;
    readonly version: number;
    readonly config: WorkingCalendarConfig;
  };
  readonly versions: readonly CompanyCalendarVersion[];
}

export interface OutdatedCalendars {
  readonly outdated: number;
  /** Listed for a company manager only; `null` for everyone else. */
  readonly projects: readonly {
    readonly id: string;
    readonly name: string;
    readonly versionNumber: number | null;
  }[] | null;
}

export const fetchCompanyCalendar = async (signal?: AbortSignal): Promise<CompanyCalendar> => {
  const { data } = await api.get<CompanyCalendar>('/calendar/company', signal ? { signal } : {});
  return data;
};

export const saveCompanyCalendar = async (
  config: WorkingCalendarConfig,
): Promise<{ versionId: string; version: number }> => {
  const { data } = await api.put<{ versionId: string; version: number }>('/calendar/company', config);
  return data;
};

export const fetchOutdatedCalendars = async (signal?: AbortSignal): Promise<OutdatedCalendars> => {
  const { data } = await api.get<OutdatedCalendars>('/projects/calendar/outdated', signal ? { signal } : {});
  return data;
};

export type CompanyCalendarFailure = 'NOT_PERMITTED' | 'NO_COMPANY' | 'INVALID' | 'NETWORK' | 'UNKNOWN';

export const classifyCompanyCalendarError = (error: unknown): CompanyCalendarFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  switch ((error.response.data as ApiErrorBody | undefined)?.code) {
    case 'COMPANY_PERMISSION_DENIED':
      return 'NOT_PERMITTED';
    case 'NO_ACTIVE_COMPANY':
      return 'NO_COMPANY';
    case 'REQUEST_VALIDATION_FAILED':
      return 'INVALID';
    default:
      return 'UNKNOWN';
  }
};
