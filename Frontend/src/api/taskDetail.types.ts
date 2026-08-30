import type { TaskKind, TaskState } from './tasks.types';

export interface StageRef {
  readonly id: string;
  readonly name: string;
  readonly isGate: boolean;
  readonly partiallyReleased: boolean;
}

export const DELEGATION_SCOPES = ['whole', 'part'] as const;
export type DelegationScope = (typeof DELEGATION_SCOPES)[number];

export interface TaskDetail {
  readonly id: string;
  readonly kind: TaskKind;
  /** `null` on standalone work, and `null` for a delegate, who is never told the project. */
  readonly project: { readonly id: string; readonly name: string } | null;
  /** Dependencies run between stages, never between tasks. Withheld from a delegate. */
  readonly stage: StageRef | null;
  readonly blockedBy: readonly StageRef[];
  readonly title: string;
  readonly description: string | null;
  readonly startDate: string;
  readonly dueDate: string;
  readonly state: TaskState;
  readonly overdue: boolean;
  readonly overdueDays: number;
  readonly counterparty: { readonly userId: string; readonly name: string } | null;

  /** Only the two parties to a delegation ever receive this. */
  readonly delegation: {
    readonly delegateName: string | null;
    readonly scope: DelegationScope;
    readonly partDescription: string | null;
  } | null;
  readonly viewerIsDelegate: boolean;
  readonly ownCrewOnly: boolean;
  readonly delegatorOnSiteRequired: boolean;
  readonly orphaned: boolean;

  readonly viewer: {
    readonly canReport: boolean;
    readonly canDelegate: boolean;
    readonly canEndDelegation: boolean;
    readonly canRequestDateChange: boolean;
  };
  /** `null` while the cascade domain does not exist. Never a fabricated count. */
  readonly rescheduleImpact: number | null;
  readonly rescheduleAvailable: boolean;
}

export const PRIVATE_ITEM_KINDS = ['subtask', 'note'] as const;
export type PrivateItemKind = (typeof PRIVATE_ITEM_KINDS)[number];

export interface PrivateWorkItem {
  readonly _id: string;
  readonly kind: PrivateItemKind;
  readonly body: string;
  readonly done: boolean;
  readonly order: number;
}
