export type ProposalStatus = 'requested' | 'open' | 'expired' | 'resolved' | 'cancelled';
export type ItemResponse = 'pending' | 'accepted' | 'declined' | 'countered' | 'other_proposed';
export type ItemResolution = 'none' | 'proposed' | 'counter' | 'other' | 'replaced';
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
  readonly otherSolution: string | null;
  readonly respondedAt: string | null;
  readonly resolution: ItemResolution;
  readonly excluded: boolean;
}

export interface ResponseSummary {
  readonly affected: number;
  readonly accepted: number;
  readonly declined: number;
  readonly countered: number;
  readonly otherProposed: number;
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
  readonly selectedAlternative: string | null;
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

export interface ScheduleCandidate {
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

export interface ExplanationEntry {
  readonly code: string;
  readonly anchorsUnavailable: number | null;
  readonly candidatesEliminated: number | null;
  readonly outcomesCollapsed: number | null;
  readonly arrangementsForced: number | null;
  readonly taskTitles: readonly string[];
  readonly date: string | null;
}

export interface AlternativesView {
  readonly requested: boolean;
  readonly constraints: {
    readonly earliestStart: string | null;
    readonly latestFinishForWork: string | null;
    readonly latestFinishForChain: string | null;
    readonly mustNotMoveTitles: readonly string[];
    readonly note: string | null;
  } | null;
  readonly candidates: readonly ScheduleCandidate[];
  readonly explanation: readonly ExplanationEntry[];
  readonly sweepTruncated: boolean;
  readonly anchorsEvaluated: number;
}

export interface AlternativesInput {
  readonly earliestStart?: string;
  readonly latestFinishForWork?: string;
  readonly latestFinishForChain?: string;
  readonly mustNotMove?: readonly string[];
  readonly note?: string;
}

export interface Handoff {
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

export interface HandoffView {
  readonly handoff: Handoff | null;
  /** Which of the two initiation paths this viewer may take, decided by the server. */
  readonly mode: HandoffMode | null;
  readonly delegateName: string | null;
  readonly currentAssigneeId: string | null;
}

export interface PendingActions {
  readonly proposals: number;
  readonly handoffs: number;
  readonly total: number;
}

export interface ProjectStage {
  readonly _id: string;
  readonly name: string;
  readonly order: number;
  readonly isGate: boolean;
  readonly dependsOn: readonly string[];
  readonly partialReleaseAt?: string;
}

export interface ProjectMute {
  readonly projectId: string;
  readonly muted: boolean;
}
