import type { TaskKind } from './tasks.types';

/** Mirrored from `Backend/src/features/tasks/task.dto.ts`. */
export interface CreatableProject {
  readonly id: string;
  readonly name: string;
  /** Whether this account may name somebody other than itself here. */
  readonly canAssignOthers: boolean;
}

export interface CreateOptions {
  readonly projects: readonly CreatableProject[];
  readonly canCreateStandalone: boolean;
}

export interface StageOption {
  readonly id: string;
  readonly name: string;
  readonly order: number;
  readonly isGate: boolean;
}

export interface AssignableMember {
  readonly userId: string;
  readonly name: string;
  readonly companyName: string | null;
}

export interface ProjectCreateOptions {
  readonly projectId: string;
  readonly name: string;
  readonly startDate: string;
  /** The overrun ceiling. Work may never be scheduled past it. */
  readonly endDate: string;
  readonly stages: readonly StageOption[];
  readonly assignees: readonly AssignableMember[];
  readonly canAssignOthers: boolean;
  readonly canManageStages: boolean;
}

/** Advisory, never a refusal — the weekly pattern is stored, holidays are not. */
export interface TaskWarning {
  readonly code: 'NON_WORKING_DAY';
  readonly field: 'startDate' | 'dueDate';
  readonly date: string;
}

export interface CreatedTask {
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

export interface CreateTaskResult {
  readonly task: CreatedTask;
  readonly warnings: readonly TaskWarning[];
}

export type CreateTaskPayload =
  | {
      readonly kind: 'project';
      readonly projectId: string;
      readonly stageId: string;
      readonly assigneeId: string;
      readonly title: string;
      readonly description?: string;
      readonly startDate: string;
      readonly dueDate: string;
      readonly ownCrewOnly: boolean;
      readonly delegatorOnSiteRequired: boolean;
    }
  | {
      readonly kind: 'standalone';
      readonly title: string;
      readonly description?: string;
      readonly startDate: string;
      readonly dueDate: string;
    };
