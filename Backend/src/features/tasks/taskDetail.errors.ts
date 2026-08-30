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

