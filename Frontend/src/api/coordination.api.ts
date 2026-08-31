import { api } from './client';
import type {
  DateChangeInput,
  Handoff,
  ImpactPreview,
  ItemDecision,
  JustifiedDeclineReason,
  PendingActions,
  Proposal,
  ProjectMute,
  ProjectStage,
  AlternativesInput,
  AlternativesView,
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
  readonly response: 'accepted' | 'declined' | 'countered' | 'other_proposed';
  readonly declineReason?: JustifiedDeclineReason;
  readonly counterStart?: string;
  readonly counterDue?: string;
  readonly otherSolution?: string;
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

export const fetchAlternatives = async (proposalId: string): Promise<AlternativesView> => {
  const { data } = await api.get<{ alternatives: AlternativesView }>(
    `/coordination/proposals/${proposalId}/alternatives`,
  );
  return data.alternatives;
};

export const requestAlternatives = async (
  proposalId: string,
  input: AlternativesInput,
): Promise<AlternativesView> => {
  const { data } = await api.post<{ alternatives: AlternativesView }>(
    `/coordination/proposals/${proposalId}/alternatives`,
    input,
  );
  return data.alternatives;
};

export const selectAlternative = async (proposalId: string, token: string): Promise<Proposal> => {
  const { data } = await api.post<{ proposal: Proposal }>(
    `/coordination/proposals/${proposalId}/alternatives/${token}/select`,
    {},
  );
  return data.proposal;
};

export const fetchHandoff = async (taskId: string, signal?: AbortSignal): Promise<Handoff | null> => {
  const { data } = await api.get<{ handoff: Handoff | null }>(
    `/coordination/tasks/${taskId}/handoff`,
    signal ? { signal } : {},
  );
  return data.handoff;
};

export const initiateHandoff = async (
  taskId: string,
  input: { toUserId: string; completedWorkAtHandover: string },
): Promise<Handoff> => {
  const { data } = await api.post<{ handoff: Handoff }>(`/coordination/tasks/${taskId}/handoff`, input);
  return data.handoff;
};

export const decideHandoff = async (handoffId: string, accept: boolean): Promise<Handoff> => {
  const { data } = await api.post<{ handoff: Handoff }>(
    `/coordination/handoffs/${handoffId}/decision`,
    { accept },
  );
  return data.handoff;
};

export const fetchPendingActions = async (
  signal?: AbortSignal,
): Promise<{ totals: PendingActions; byProject: Record<string, PendingActions> }> => {
  const { data } = await api.get<{ totals: PendingActions; byProject: Record<string, PendingActions> }>(
    '/coordination/pending-actions',
    signal ? { signal } : {},
  );
  return data;
};

export const fetchProjectStages = async (
  projectId: string,
  signal?: AbortSignal,
): Promise<readonly ProjectStage[]> => {
  const { data } = await api.get<{ stages: ProjectStage[] }>(
    `/projects/${projectId}/stages`,
    signal ? { signal } : {},
  );
  return data.stages;
};

export const createProjectStage = async (
  projectId: string,
  input: { name: string; isGate: boolean },
): Promise<ProjectStage> => {
  const { data } = await api.post<{ stage: ProjectStage }>(`/projects/${projectId}/stages`, input);
  return data.stage;
};

export const updateProjectStage = async (
  projectId: string,
  stageId: string,
  input: { name?: string; isGate?: boolean; order?: number },
): Promise<ProjectStage> => {
  const { data } = await api.patch<{ stage: ProjectStage }>(
    `/projects/${projectId}/stages/${stageId}`,
    input,
  );
  return data.stage;
};

export const setStageDependencies = async (
  projectId: string,
  stageId: string,
  dependsOn: readonly string[],
): Promise<ProjectStage> => {
  const { data } = await api.patch<{ stage: ProjectStage }>(
    `/projects/${projectId}/stages/${stageId}/dependencies`,
    { dependsOn },
  );
  return data.stage;
};

export const fetchProjectMute = async (projectId: string, signal?: AbortSignal): Promise<ProjectMute> => {
  const { data } = await api.get<{ mute: ProjectMute }>(
    `/mutes/projects/${projectId}`,
    signal ? { signal } : {},
  );
  return data.mute;
};

export const setProjectMute = async (projectId: string, muted: boolean): Promise<ProjectMute> => {
  const { data } = await api.put<{ mute: ProjectMute }>(`/mutes/projects/${projectId}`, { muted });
  return data.mute;
};
