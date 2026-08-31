import { api } from './client';
import type {
  AccountAction,
  ModerationQueueResponse,
  ModerationReportResponse,
  ModerationReportStatus,
  ResolutionOutcome,
} from './moderation.types';

export const fetchModerationQueue = async (
  status?: ModerationReportStatus,
): Promise<ModerationQueueResponse> => {
  const { data } = await api.get<ModerationQueueResponse>('/moderation/reports', {
    params: status === undefined ? {} : { status },
  });
  return data;
};

export const fetchModerationReport = async (reportId: string): Promise<ModerationReportResponse> => {
  const { data } = await api.get<ModerationReportResponse>(`/moderation/reports/${reportId}`);
  return data;
};

export const claimModerationReport = async (reportId: string): Promise<ModerationReportResponse> => {
  const { data } = await api.post<ModerationReportResponse>(`/moderation/reports/${reportId}/claim`);
  return data;
};

export const resolveModerationReport = async (
  reportId: string,
  outcome: ResolutionOutcome,
  note?: string,
): Promise<ModerationReportResponse> => {
  const { data } = await api.post<ModerationReportResponse>(
    `/moderation/reports/${reportId}/resolve`,
    { outcome, ...(note ? { note } : {}) },
  );
  return data;
};

export const applyAccountAction = async (
  reportId: string,
  action: AccountAction,
  reason: string,
): Promise<ModerationReportResponse> => {
  const { data } = await api.post<ModerationReportResponse>(
    `/moderation/reports/${reportId}/account-action`,
    { action, reason },
  );
  return data;
};
