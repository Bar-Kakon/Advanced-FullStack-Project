import { api } from './client';
import type {
  DateChangeInput,
  ImpactPreview,
  ItemDecision,
  JustifiedDeclineReason,
  Proposal,
} from './coordination.types';

export const previewDateChange = async (
  taskId: string,
  input: DateChangeInput,
  signal?: AbortSignal,
): Promise<ImpactPreview> => {
  const { data } = await api.post<{ preview: ImpactPreview }>(
    `/tasks/${taskId}/date-change/preview`,
    input,
    signal ? { signal } : {},
  );
  return data.preview;
};

export const requestDateChange = async (
  taskId: string,
  input: DateChangeInput,
): Promise<Proposal> => {
  const { data } = await api.post<{ proposal: Proposal }>(`/tasks/${taskId}/date-change`, input);
  return data.proposal;
};

export const fetchProposal = async (proposalId: string, signal?: AbortSignal): Promise<Proposal> => {
  const { data } = await api.get<{ proposal: Proposal }>(
    `/coordination/proposals/${proposalId}`,
    signal ? { signal } : {},
  );
  return data.proposal;
};

export const launchProposal = async (proposalId: string): Promise<Proposal> => {
  const { data } = await api.post<{ proposal: Proposal }>(`/coordination/proposals/${proposalId}/launch`, {});
  return data.proposal;
};

export const cancelProposal = async (proposalId: string): Promise<Proposal> => {
  const { data } = await api.post<{ proposal: Proposal }>(`/coordination/proposals/${proposalId}/cancel`, {});
  return data.proposal;
};

export interface RespondInput {
  readonly response: 'accepted' | 'declined' | 'countered';
  readonly declineReason?: JustifiedDeclineReason;
  readonly counterStart?: string;
  readonly counterDue?: string;
}

export const respondToItem = async (
  proposalId: string,
  itemId: string,
  input: RespondInput,
): Promise<Proposal> => {
  const { data } = await api.post<{ proposal: Proposal }>(
    `/coordination/proposals/${proposalId}/items/${itemId}/respond`,
    input,
  );
  return data.proposal;
};

export const setItemExcluded = async (
  proposalId: string,
  itemId: string,
  excluded: boolean,
): Promise<Proposal> => {
  const { data } = await api.patch<{ proposal: Proposal }>(
    `/coordination/proposals/${proposalId}/items/${itemId}/exclusion`,
    { excluded },
  );
  return data.proposal;
};

export const resolveProposal = async (
  proposalId: string,
  decisions: readonly ItemDecision[],
  note?: string,
): Promise<Proposal> => {
  const { data } = await api.post<{ proposal: Proposal }>(
    `/coordination/proposals/${proposalId}/resolve`,
    { decisions, ...(note === undefined || note === '' ? {} : { note }) },
  );
  return data.proposal;
};
