import type { TaskRecord } from './task.model.js';

/**
 * The three working states, derived on every read from the two timestamps. Nothing here is stored,
 * and `overdue` is deliberately NOT one of them — it is a separate fact about the same task.
 */
export const TASK_STATES = ['not_started', 'in_progress', 'completed'] as const;
export type TaskState = (typeof TASK_STATES)[number];

export const deriveTaskState = (task: Pick<TaskRecord, 'startedAt' | 'completedAt'>): TaskState => {
  if (task.completedAt !== undefined) return 'completed';
  if (task.startedAt !== undefined) return 'in_progress';
  return 'not_started';
};

/** Calendar comparison, so a task due today is not overdue until the day is actually past. */
const startOfDay = (at: Date): number =>
  Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());

/**
 * Overdue is a comparison made at read time and never a stored status: the target has passed and
 * the work is not finished. An orphaned task freezes, so it cannot drift further overdue.
 */
export const isOverdue = (
  task: Pick<TaskRecord, 'dueDate' | 'completedAt' | 'orphanedAt'>,
  now: Date,
): boolean => {
  if (task.completedAt !== undefined) return false;
  const reference = task.orphanedAt ?? now;
  return startOfDay(task.dueDate) < startOfDay(reference);
};

export const overdueDays = (
  task: Pick<TaskRecord, 'dueDate' | 'completedAt' | 'orphanedAt'>,
  now: Date,
): number => {
  if (!isOverdue(task, now)) return 0;
  const reference = task.orphanedAt ?? now;
  return Math.round((startOfDay(reference) - startOfDay(task.dueDate)) / 86_400_000);
};
