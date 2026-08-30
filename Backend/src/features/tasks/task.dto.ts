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
