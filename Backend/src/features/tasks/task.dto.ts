import type { TaskKind } from './task.model.js';
import type { TaskState } from './taskState.js';
import type { CounterpartyRef } from './taskVisibility.js';

export interface TaskProjectRef {
  readonly id: string;
  readonly name: string;
}

export interface MyTaskDto {
  readonly id: string;
  /** Stored, not inferred — the source distinction the screen shows explicitly. */
  readonly kind: TaskKind;
  /** `null` on standalone work, and `null` for a delegate, who is never told the project. */
  readonly project: TaskProjectRef | null;
  readonly title: string;
  readonly description: string | null;

  readonly startDate: string;
  readonly dueDate: string;
  /** Derived on read from the two timestamps. Never stored. */
  readonly state: TaskState;
  /** A separate fact about the task, not one of its states. */
  readonly overdue: boolean;
  readonly overdueDays: number;
  readonly startedAt: string | null;
  readonly completedAt: string | null;

  /** Resolved per viewer. `null` means nobody — the row says so in its own words. */
  readonly counterparty: CounterpartyRef | null;

  /** True only for the two parties to the delegation. The party above never sees it. */
  readonly delegated: boolean;
  /** Whether THIS viewer is the hidden performer. */
  readonly viewerIsDelegate: boolean;

  readonly orphaned: boolean;

  /** What this viewer may actually do, so no control is offered that the API would refuse. */
  readonly canStart: boolean;
  readonly canComplete: boolean;

  /**
   * Whether a date-change proposal is waiting on this viewer. `null` while the proposal domain
   * does not exist — never a false, which would claim there is nothing waiting.
   */
  readonly pendingProposal: boolean | null;
}

export interface MyTasksPageDto {
  readonly tasks: readonly MyTaskDto[];
  readonly nextCursor: string | null;
}

/**
 * Advisory, never a refusal. The weekly pattern is stored and approved; holidays are not, so a
 * warning is the most this can honestly say about a date.
 */
export interface TaskWarning {
  readonly code: 'NON_WORKING_DAY';
  readonly field: 'startDate' | 'dueDate';
  readonly date: string;
}

export interface CreatedTaskDto {
  readonly id: string;
  readonly kind: TaskKind;
  readonly projectId: string | null;
  readonly stageId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly assigneeId: string | null;
  readonly startDate: string;
  readonly dueDate: string;
  readonly ownCrewOnly: boolean;
  readonly delegatorOnSiteRequired: boolean;
}

export interface CreatableProjectDto {
  readonly id: string;
  readonly name: string;
  /** Whether this account may name somebody other than itself here. */
  readonly canAssignOthers: boolean;
}

export interface CreateOptionsDto {
  readonly projects: readonly CreatableProjectDto[];
  readonly canCreateStandalone: boolean;
}

export interface StageOptionDto {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly isGate: boolean;
}

/** Only active members. An unanswered invitation is not somebody work can be handed to. */
export interface AssignableMemberDto {
  readonly userId: string;
  readonly name: string;
  readonly companyName: string | null;
}

export interface ProjectCreateOptionsDto {
  readonly projectId: string;
  readonly name: string;
  readonly startDate: string;
  /** The overrun ceiling. Work may never be scheduled past it. */
  readonly endDate: string;
  readonly stages: readonly StageOptionDto[];
  readonly assignees: readonly AssignableMemberDto[];
  readonly canAssignOthers: boolean;
  readonly canManageStages: boolean;
}
