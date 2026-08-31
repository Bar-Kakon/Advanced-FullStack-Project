import { AppError } from '../../shared/errors.js';

export const exceptionNotFound = (): AppError =>
  new AppError('Schedule exception not found.', 404, 'SCHEDULE_EXCEPTION_NOT_FOUND');

export const notPermittedToApprove = (): AppError =>
  new AppError(
    'Approving a schedule exception needs the schedule.exception.approve grant.',
    403,
    'SCHEDULE_EXCEPTION_NOT_PERMITTED',
  );

export const notResponsibleForTask = (): AppError =>
  new AppError(
    'A task exception may only be requested by the person responsible for that task.',
    403,
    'SCHEDULE_EXCEPTION_NOT_RESPONSIBLE',
  );

export const projectScopeNeedsAuthority = (): AppError =>
  new AppError(
    'A project-wide exception is not a request for oneself, so it needs the approval grant.',
    403,
    'SCHEDULE_EXCEPTION_PROJECT_SCOPE',
  );

/** An approval ends the matter. Nothing reopens a decided request; a new one is raised instead. */
export const alreadyDecided = (): AppError =>
  new AppError('That schedule exception was already decided.', 409, 'SCHEDULE_EXCEPTION_DECIDED');

export const onlyApproverMayModify = (): AppError =>
  new AppError(
    'Only the authorised approver may change a request before approving it.',
    403,
    'SCHEDULE_EXCEPTION_NOT_MODIFIABLE',
  );

export const onlySubmitterMayCancel = (): AppError =>
  new AppError(
    'Only the professional who submitted a request may withdraw it.',
    403,
    'SCHEDULE_EXCEPTION_NOT_CANCELLABLE',
  );

export const invalidWindow = (): AppError =>
  new AppError('An exception cannot end before it starts.', 422, 'SCHEDULE_EXCEPTION_BAD_WINDOW');

export const windowTooLong = (): AppError =>
  new AppError('One exception may not cover more than a year.', 422, 'SCHEDULE_EXCEPTION_TOO_LONG');
