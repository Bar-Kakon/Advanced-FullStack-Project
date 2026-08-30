export type ProposalStatus = 'requested' | 'open' | 'expired' | 'resolved' | 'cancelled';
export type ItemResponse = 'pending' | 'accepted' | 'declined' | 'countered';
export type ItemResolution = 'none' | 'proposed' | 'counter' | 'replaced';
export type HoldReason = 'initiating' | 'gate' | 'sequence';

export const JUSTIFIED_DECLINE_REASONS = [
  'health',
  'plans_not_ready',
  'equipment_failure',
  'permit_unavailable',
  'gc_stop',
  'materials_not_arrived',
  'tools_not_arrived',
] as const;
export type JustifiedDeclineReason = (typeof JUSTIFIED_DECLINE_REASONS)[number];

export interface RequestedChanges {
  readonly deltaWorkingDays: number | null;
  readonly alternativeStart: string | null;
  readonly alternativeDue: string | null;
  readonly note: string | null;
}

export interface Ceiling {
  readonly ceilingDate: string;
  readonly latestProposedDue: string | null;
  readonly exceeded: boolean;
}

export interface ImpactItem {
  readonly taskId: string;
  readonly taskTitle: string;
  readonly stageName: string | null;
  readonly respondentName: string | null;
  readonly currentStart: string;
  readonly currentDue: string;
  readonly proposedStart: string;
  readonly proposedDue: string;
  readonly reason: HoldReason;
  readonly shiftWorkingDays: number;
  readonly excluded: boolean;
}

export interface UnaffectedWork {
  readonly taskId: string;
  readonly taskTitle: string;
  readonly stageName: string | null;
}

export interface ImpactPreview {
  readonly initiatingTaskId: string;
  readonly initiatingTaskTitle: string;
  readonly requestedChanges: RequestedChanges;
  readonly detailed: boolean;
  readonly affected: readonly ImpactItem[];
  readonly affectedCount: number;
  readonly otherProfessionalsCount: number;
  readonly unaffected: readonly UnaffectedWork[];
  readonly unaffectedCount: number;
  readonly gateHeldCount: number;
  readonly ceiling: Ceiling;
}

export interface ProposalItem {
  readonly id: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly stageName: string | null;
  readonly respondentName: string | null;
  readonly isMine: boolean;
  readonly currentStart: string;
  readonly currentDue: string;
  readonly proposedStart: string;
  readonly proposedDue: string;
  readonly reason: HoldReason;
  readonly response: ItemResponse;
  readonly declineReason: JustifiedDeclineReason | null;
  readonly counterStart: string | null;
  readonly counterDue: string | null;
  readonly respondedAt: string | null;
  readonly resolution: ItemResolution;
  readonly excluded: boolean;
}

export interface ResponseSummary {
  readonly affected: number;
  readonly accepted: number;
  readonly declined: number;
  readonly countered: number;
  readonly pending: number;
  readonly excluded: number;
}

export interface ProposalViewer {
  readonly canLaunch: boolean;
  readonly canResolve: boolean;
  readonly canCancel: boolean;
  readonly canAdjustImpact: boolean;
  readonly seesResponseMatrix: boolean;
  readonly respondableItemIds: readonly string[];
}

export interface Proposal {
  readonly id: string;
  readonly projectId: string;
  readonly status: ProposalStatus;
  readonly expired: boolean;
  readonly initiatingTaskId: string;
  readonly initiatingTaskTitle: string;
  readonly requestedByName: string | null;
  readonly requestedByMe: boolean;
  readonly reason: string | null;
  readonly changes: RequestedChanges;
  readonly responseHours: number;
  readonly expiresAt: string | null;
  readonly launchedAt: string | null;
  readonly resolvedAt: string | null;
  readonly resolutionNote: string | null;
  readonly parentProposalId: string | null;
  readonly items: readonly ProposalItem[];
  readonly summary: ResponseSummary | null;
  readonly viewer: ProposalViewer;
  readonly ceiling: Ceiling | null;
}

export interface ProposalListRow {
  readonly id: string;
  readonly status: ProposalStatus;
  readonly expired: boolean;
  readonly initiatingTaskTitle: string;
  readonly requestedByName: string | null;
  readonly affectedCount: number;
  readonly pendingCount: number | null;
  readonly awaitingMe: boolean;
  readonly expiresAt: string | null;
  readonly createdAt: string;
}

export interface AuditEntry {
  readonly id: string;
  readonly action: string;
  readonly actorName: string;
  readonly taskTitle: string | null;
  readonly proposalId: string | null;
  readonly at: string;
  readonly details: Record<string, unknown>;
}

export interface DateChangeInput {
  readonly deltaWorkingDays?: number;
  readonly alternativeStart?: string;
  readonly alternativeDue?: string;
  readonly reason?: string;
  readonly responseHours?: number;
}

export interface ItemDecision {
  readonly itemId: string;
  readonly resolution: ItemResolution;
}
