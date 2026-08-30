import { AppError } from '../../shared/errors.js';

/**
 * One answer for "not yours" and "not there".
 *
 * A work plan on a task a viewer cannot reach must not be distinguishable from one that does not
 * exist, or the 404 itself becomes the disclosure the delegation wall exists to prevent.
 */
export const workPlanNotFound = (): AppError =>
  new AppError('Work plan is not available', 404, 'WORK_PLAN_NOT_FOUND');

export const notPermittedToManageWorkPlans = (): AppError =>
  new AppError('Not permitted to manage work plans here', 403, 'WORK_PLAN_NOT_PERMITTED');

/** A delegate publishing where the party above would read it. Refused, never downgraded silently. */
export const visibilityNotPermitted = (): AppError =>
  new AppError('Not permitted to publish at that visibility', 403, 'WORK_PLAN_VISIBILITY_NOT_PERMITTED');

export const workPlanFileRequired = (): AppError =>
  new AppError('A file is required', 400, 'WORK_PLAN_FILE_REQUIRED');
