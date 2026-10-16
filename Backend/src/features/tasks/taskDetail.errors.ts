import { AppError } from '../../shared/errors.js';

/** Single level only — the delegate cannot hand the work on again. */
export const cannotRedelegate = (): AppError =>
  new AppError('Work that was delegated to you cannot be delegated again.', 409, 'CANNOT_REDELEGATE');

export const alreadyDelegated = (): AppError =>
  new AppError('That work is already delegated.', 409, 'ALREADY_DELEGATED');

export const notDelegated = (): AppError =>
  new AppError('That work is not delegated.', 409, 'NOT_DELEGATED');

export const cannotDelegateToSelf = (): AppError =>
  new AppError('Work cannot be delegated to yourself.', 409, 'CANNOT_DELEGATE_TO_SELF');

/** The GC may require the committed party's own crew, which forbids handing the work on at all. */
export const ownCrewOnly = (): AppError =>
  new AppError('This work is committed to your own crew and cannot be delegated.', 409, 'OWN_CREW_ONLY');

export const partNeedsDescription = (): AppError =>
  new AppError('Delegating part of the work needs that part described.', 400, 'PART_NEEDS_DESCRIPTION');

export const privateItemNotSubtask = (): AppError =>
  new AppError('Only a sub-task has an execution to start or complete.', 409, 'PRIVATE_ITEM_NOT_SUBTASK');

export const privateItemAlreadyStarted = (): AppError =>
  new AppError('That sub-task has already started.', 409, 'PRIVATE_ITEM_ALREADY_STARTED');

export const privateItemNotStarted = (): AppError =>
  new AppError('That sub-task has not started yet.', 409, 'PRIVATE_ITEM_NOT_STARTED');

export const privateItemAlreadyCompleted = (): AppError =>
  new AppError('That sub-task is already complete.', 409, 'PRIVATE_ITEM_ALREADY_COMPLETED');
