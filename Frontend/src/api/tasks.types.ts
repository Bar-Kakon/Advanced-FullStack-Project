/** Mirrored from `Backend/src/features/tasks/task.model.ts`. Stored, never inferred. */
export const TASK_KINDS = ['project', 'standalone'] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

/** Mirrored from `taskState.ts`. Derived on read from two timestamps — never stored. */
export const TASK_STATES = ['not_started', 'in_progress', 'completed'] as const;
export type TaskState = (typeof TASK_STATES)[number];

export interface TaskProjectRef {
  readonly id: string;
  readonly name: string;
}

export interface CounterpartyRef {
  readonly userId: string;
  readonly name: string;
}

export interface MyTask {
  readonly id: string;
  readonly kind: TaskKind;
  /** `null` on standalone work, and `null` for a delegate, who is never told the project. */
  readonly project: TaskProjectRef | null;
  readonly title: string;
  readonly description: string | null;

  readonly startDate: string;
  readonly dueDate: string;
  readonly state: TaskState;
  /** A separate fact about the task, not one of its states. */
  readonly overdue: boolean;
  readonly overdueDays: number;
  readonly startedAt: string | null;
  readonly completedAt: string | null;

  /** Resolved per viewer. `null` means nobody — the row says so in its own words. */
  readonly counterparty: CounterpartyRef | null;

  readonly delegated: boolean;
  readonly viewerIsDelegate: boolean;
  readonly orphaned: boolean;

  readonly canStart: boolean;
  readonly canComplete: boolean;

  /** `null` while the proposal domain does not exist. Never rendered as "nothing waiting". */
  readonly pendingProposal: boolean | null;
}

export interface MyTasksPage {
  readonly tasks: readonly MyTask[];
  readonly nextCursor: string | null;
}

export interface MyTasksFilters {
  readonly projectId: string;
  readonly kind: TaskKind | '';
  readonly state: TaskState | '';
  readonly sort: 'due_asc' | 'due_desc';
}

export const emptyTaskFilters: MyTasksFilters = {
  projectId: '',
  kind: '',
  state: '',
  sort: 'due_asc',
};

/** The project control's "no project" option, kept apart from a real project id. */
export const NO_PROJECT = 'none';
