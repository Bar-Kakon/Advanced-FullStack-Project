import type { ProjectRecord } from './project.model.js';

/**
 * The statuses a project can be in. They are DERIVED on every read and never stored, because the
 * closed rule is that statuses follow the working schedule automatically rather than being set by
 * hand. There is no manual control anywhere in the API.
 */
export const PROJECT_STATUSES = ['planned', 'active', 'paused', 'completed'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

/**
 * The closed definitions need execution facts this system does not have yet:
 *
 *   started   = the GC set a date AND the first task started on that date
 *   completed = every task is closed and the work finished with quality execution
 *
 * Tasks are unbuilt, so both answers come from here. The rule is written down in one place and
 * evaluated against real data the moment the Tasks domain exists — it is not approximated by the
 * start date having arrived, which is a different rule that nobody decided.
 */
export interface ProjectExecutionPort {
  hasFirstTaskStarted(projectId: string): Promise<boolean>;
  areAllTasksClosed(projectId: string): Promise<boolean>;
}

/** Every answer is `false` until Tasks exist: no project has started, none can be completed. */
export const unbuiltTasksExecutionPort: ProjectExecutionPort = {
  async hasFirstTaskStarted() {
    return false;
  },
  async areAllTasksClosed() {
    return false;
  },
};

export const deriveStatus = (project: ProjectRecord): ProjectStatus => {
  if (project.completedAt !== undefined) return 'completed';
  if (project.pausedAt !== undefined) return 'paused';
  if (project.startedAt !== undefined) return 'active';
  return 'planned';
};

/** Cancellation is available only while the project has not started. */
export const isCancellable = (project: ProjectRecord): boolean =>
  project.startedAt === undefined && project.completedAt === undefined;
