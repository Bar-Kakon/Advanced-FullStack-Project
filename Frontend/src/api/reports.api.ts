import { isAxiosError } from 'axios';

import { api } from './client';
import type { ApiErrorBody } from './types';
import type { SubmitReportFailure, SubmitReportPayload, SubmitReportResponse } from './reports.types';

export const submitUserReport = async (
  userId: string,
  payload: SubmitReportPayload,
): Promise<SubmitReportResponse> => {
  const { data } = await api.post<SubmitReportResponse>(`/reports/users/${userId}`, payload);
  return data;
};

/**
 * Turns whatever Axios threw into one of the cases the dialog can word. A request that never
 * reached the server carries no response at all, so reading a code off it would itself throw.
 */
export const classifySubmitReportError = (error: unknown): SubmitReportFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  const code = (error.response.data as ApiErrorBody | undefined)?.code;
  if (code === 'CANNOT_REPORT_SELF') return 'CANNOT_REPORT_SELF';
  if (code === 'DUPLICATE_OPEN_REPORT') return 'DUPLICATE_OPEN_REPORT';
  if (code === 'TOO_MANY_REQUESTS') return 'TOO_MANY_REQUESTS';
  if (error.response.status === 404) return 'NOT_FOUND';
  return 'UNKNOWN';
};
