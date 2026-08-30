import { AppError } from '../../shared/errors.js';

/**
 * A task the viewer may not see answers exactly as one that does not exist — same status, same
 * code, same message — so a general contractor probing task URLs cannot detect a delegate's work
 * from the response alone (D16).
 */
export const taskNotFound = (): AppError => new AppError('Task not found.', 404, 'TASK_NOT_FOUND');

export const notThePerformer = (): AppError =>
  new AppError('Only the person performing this work may report on it.', 403, 'NOT_THE_PERFORMER');

export const alreadyStarted = (): AppError =>
  new AppError('That work has already been started.', 409, 'TASK_ALREADY_STARTED');

export const notStartedYet = (): AppError =>
  new AppError('That work has not been started.', 409, 'TASK_NOT_STARTED');

export const alreadyCompleted = (): AppError =>
  new AppError('That work is already complete.', 409, 'TASK_ALREADY_COMPLETED');

/** Frozen dates: nothing moves on an orphaned task until the GC resolves it. */
export const taskOrphaned = (): AppError =>
  new AppError('That work has no responsible party right now.', 409, 'TASK_ORPHANED');
