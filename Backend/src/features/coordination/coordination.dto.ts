import type { HoldReason } from './cascade.js';
import type {
  ItemResolution,
  ItemResponse,
  JustifiedDeclineReason,
  ProposalStatus,
} from './proposal.model.js';

export interface ImpactItemDto {
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

export interface UnaffectedWorkDto {
  readonly taskId: string;
  readonly taskTitle: string;
  readonly stageName: string | null;
}

export interface CeilingDto {
  readonly ceilingDate: string;
  readonly latestProposedDue: string | null;
  readonly exceeded: boolean;
}

export interface ImpactPreviewDto {
  readonly initiatingTaskId: string;
  readonly initiatingTaskTitle: string;
  readonly requestedChanges: RequestedChangesDto;
  readonly detailed: boolean;
  readonly affected: readonly ImpactItemDto[];
  readonly affectedCount: number;
  readonly otherProfessionalsCount: number;
  readonly unaffected: readonly UnaffectedWorkDto[];
  readonly unaffectedCount: number;
  readonly gateHeldCount: number;
  readonly ceiling: CeilingDto;
}

export interface RequestedChangesDto {
  readonly deltaWorkingDays: number | null;
  readonly alternativeStart: string | null;
  readonly alternativeDue: string | null;
  readonly note: string | null;
}

export interface ProposalItemDto {
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
  readonly otherSolution: string | null;
  readonly respondedAt: string | null;
  readonly resolution: ItemResolution;
  readonly excluded: boolean;
}

export interface ResponseSummaryDto {
  readonly affected: number;
  readonly accepted: number;
  readonly declined: number;
  readonly countered: number;
  readonly otherProposed: number;
  readonly pending: number;
  readonly excluded: number;
}

export interface ProposalViewerDto {
  readonly canLaunch: boolean;
  readonly canResolve: boolean;
  readonly canCancel: boolean;
  readonly canAdjustImpact: boolean;
  readonly seesResponseMatrix: boolean;
  readonly respondableItemIds: readonly string[];
}

export interface ProposalDto {
  readonly id: string;
  readonly projectId: string;
  readonly status: ProposalStatus;
  readonly expired: boolean;
  readonly initiatingTaskId: string;
  readonly initiatingTaskTitle: string;
  readonly requestedByName: string | null;
  readonly requestedByMe: boolean;
  readonly reason: string | null;
  readonly changes: RequestedChangesDto;
  readonly responseHours: number;
  readonly expiresAt: string | null;
  readonly launchedAt: string | null;
  readonly resolvedAt: string | null;
  readonly resolutionNote: string | null;
  readonly parentProposalId: string | null;
  readonly selectedAlternative: string | null;
  readonly items: readonly ProposalItemDto[];
  readonly summary: ResponseSummaryDto | null;
  readonly viewer: ProposalViewerDto;
  readonly ceiling: CeilingDto | null;
}

export interface ProposalListRowDto {
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

export interface AuditEntryDto {
  readonly id: string;
  readonly action: string;
  readonly actorName: string;
  readonly taskTitle: string | null;
  readonly proposalId: string | null;
  readonly at: string;
  readonly details: Record<string, unknown>;
}

export interface ScheduleCandidateDto {
  readonly token: string;
  readonly startDate: string;
  readonly dueDate: string;
  readonly affectedTaskCount: number;
  readonly affectedProfessionalCount: number;
  readonly onlyInitiatingWorkMoves: boolean;
  readonly latestFinishInArrangement: string;
  readonly equivalentAnchorCount: number;
  readonly selected: boolean;
}

export interface ExplanationEntryDto {
  readonly code: string;
  readonly anchorsUnavailable: number | null;
  readonly candidatesEliminated: number | null;
  readonly outcomesCollapsed: number | null;
  readonly arrangementsForced: number | null;
  readonly taskTitles: readonly string[];
  readonly date: string | null;
}

export interface AlternativesDto {
  readonly requested: boolean;
  readonly constraints: {
    readonly earliestStart: string | null;
    readonly latestFinishForWork: string | null;
    readonly latestFinishForChain: string | null;
    readonly mustNotMoveTitles: readonly string[];
    readonly note: string | null;
  } | null;
  readonly candidates: readonly ScheduleCandidateDto[];
  readonly explanation: readonly ExplanationEntryDto[];
  readonly sweepTruncated: boolean;
  readonly anchorsEvaluated: number;
}

export interface HandoffDto {
  readonly id: string;
  readonly taskId: string;
  readonly taskTitle: string;
  readonly kind: string;
  readonly state: string;
  readonly fromName: string | null;
  readonly toName: string | null;
  readonly completedWorkAtHandover: string;
  readonly initiatedAt: string;
  readonly decidedAt: string | null;
  readonly viewerDecides: boolean;
}

export type HandoffMode = 'authority' | 'disclosure';

export interface HandoffViewDto {
  readonly handoff: HandoffDto | null;
  readonly mode: HandoffMode | null;
  readonly delegateName: string | null;
  readonly currentAssigneeId: string | null;
}

export interface PendingActionsDto {
  readonly proposals: number;
  readonly handoffs: number;
  readonly total: number;
}
