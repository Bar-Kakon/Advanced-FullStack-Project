import type { ProjectRecord } from './project.model.js';

/**
 * The statuses a project can be in. They are DERIVED on every read and never stored, because the
 * closed rule is that statuses follow the work automatically rather than being set by hand. There
 * is no manual control anywhere in the API.
 */
export const PROJECT_STATUSES = ['planned', 'active', 'paused', 'completed'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface ProjectTaskSummary {
  readonly total: number;
  readonly open: number;
  readonly overdue: number;
  readonly completed: number;
}

/**
 * The execution facts the lifecycle rules are stated in terms of.
 *
 * The closed definitions are:
 *
 *   started   = the project's start date has arrived AND the first task has actually started,
 *               through somebody pressing Start
 *   completed = every task is closed AND the work was finished to quality
 *
 * `startedProjectIds` is the batch form, so a list of projects costs one query rather than one
 * per row.
 */
export interface ProjectExecutionPort {
  hasFirstTaskStarted(projectId: string): Promise<boolean>;
  startedProjectIds(projectIds: readonly string[]): Promise<ReadonlySet<string>>;
  areAllTasksClosed(projectId: string): Promise<boolean>;
  /** `null` when the project has no work at all. A count nobody can compute is never a zero. */
  summarize(projectId: string): Promise<ProjectTaskSummary | null>;
}

/** Every answer is empty until Tasks exist: no project has started, none can be completed. */
export const unbuiltTasksExecutionPort: ProjectExecutionPort = {
  async hasFirstTaskStarted() {
    return false;
  },
  async startedProjectIds() {
    return new Set<string>();
  },
  async areAllTasksClosed() {
    return false;
  },
  async summarize() {
    return null;
  },
};

const startOfDay = (at: Date): number =>
  Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());

/** The first half of the closed start rule: the date the GC configured has arrived. */
export const startDateReached = (project: Pick<ProjectRecord, 'startDate'>, now: Date): boolean =>
  startOfDay(project.startDate) <= startOfDay(now);

/**
 * Whether the project has started, by the closed rule and both of its halves.
 *
 * `firstTaskStarted` comes from the Tasks domain, where a start timestamp is only ever written by
 * an explicit Start. The status is an automatic RECORD of that fact — it never causes work to
 * begin, and nothing writes a second copy of it onto the project.
 */
export const hasStarted = (
  project: Pick<ProjectRecord, 'startDate'>,
  firstTaskStarted: boolean,
  now: Date = new Date(),
): boolean => firstTaskStarted && startDateReached(project, now);

/**
 * The status a screen shows.
 *
 * Completion is NOT derived from the tasks being closed. The closed rule has two halves — every
 * task closed AND the work finished to quality — and the model holds no representation of the
 * quality half, so `completedAt` remains the record that both were satisfied. Deriving completion
 * from task closure alone would silently drop half the rule.
 */
export const deriveStatus = (
  project: ProjectRecord,
  firstTaskStarted: boolean,
  now: Date = new Date(),
): ProjectStatus => {
  if (project.completedAt !== undefined) return 'completed';
  if (project.pausedAt !== undefined) return 'paused';
  if (hasStarted(project, firstTaskStarted, now)) return 'active';
  return 'planned';
};

/** Cancellation is available only while the project has not started (D24). */
export const isCancellable = (
  project: ProjectRecord,
  firstTaskStarted: boolean,
  now: Date = new Date(),
): boolean => !hasStarted(project, firstTaskStarted, now) && project.completedAt === undefined;
