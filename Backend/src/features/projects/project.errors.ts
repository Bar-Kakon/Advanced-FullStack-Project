import { AppError } from '../../shared/errors.js';

/**
 * A project the caller may not see answers exactly as one that does not exist — same status, same
 * code, same message — so the response cannot be used to discover that it exists (D16).
 */
export const projectNotFound = (): AppError =>
  new AppError('Project not found.', 404, 'PROJECT_NOT_FOUND');

export const noActiveCompany = (): AppError =>
  new AppError('No active company for this account.', 403, 'NO_ACTIVE_COMPANY');

export const notPermittedToCreate = (): AppError =>
  new AppError('This account may not create projects for its company.', 403, 'COMPANY_PERMISSION_DENIED');

export const targetBeforeStart = (): AppError =>
  new AppError('The target end date cannot precede the start date.', 400, 'TARGET_BEFORE_START');

export const overrunCeilingExceeded = (): AppError =>
  new AppError('The target end date would pass the overrun allowance.', 400, 'OVERRUN_CEILING_EXCEEDED');

export const overrunAllowanceImmutable = (): AppError =>
  new AppError('The overrun allowance cannot be changed after the project is created.', 400, 'OVERRUN_ALLOWANCE_IMMUTABLE');

/** Cancellation exists before work starts and nowhere else (D24). */
export const projectAlreadyStarted = (): AppError =>
  new AppError('A project that has started cannot be cancelled.', 409, 'PROJECT_ALREADY_STARTED');

export const calendarVersionMissing = (): AppError =>
  new AppError('The company has no working calendar version to adopt.', 409, 'CALENDAR_VERSION_MISSING');

/**
 * The business is already at the project capacity its plan allows. A commercial limit, not an
 * authorization failure: everybody who may create a project still may, once there is room.
 */
export const projectPlanLimitReached = (): AppError =>
  new AppError('The current plan allows no further projects.', 409, 'PROJECT_PLAN_LIMIT_REACHED');
