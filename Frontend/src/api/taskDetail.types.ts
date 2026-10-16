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
  /** The dates first agreed; `null` when the historical original was never recorded. */
  readonly originalStartDate: string | null;
  readonly originalDueDate: string | null;
  /** `migration_baseline` is never presented as a verified record of the original agreement. */
  readonly originalDatesSource: 'creation' | 'agreement' | 'migration_baseline' | null;
  /** The standalone date-change trail, newest first; always empty on project work. */
  readonly dateChanges: readonly {
    readonly at: string;
    readonly fromStartDate: string;
    readonly fromDueDate: string;
    readonly toStartDate: string;
    readonly toDueDate: string;
    readonly reason: string | null;
  }[];
  readonly state: TaskState;
  readonly overdue: boolean;
  readonly overdueDays: number;
  readonly counterparty: { readonly userId: string; readonly name: string } | null;
  /** Work that arrived through an accepted agreement; the counterparty is then its owner. */
  readonly fromAgreement: boolean;
  readonly agreementDocuments: readonly {
    readonly id: string;
    readonly filename: string;
    readonly mimeType: string;
    readonly sizeBytes: number;
  }[];

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
  readonly createdAt: string;
}
