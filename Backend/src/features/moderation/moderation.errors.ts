import { AppError } from '../../shared/errors.js';

/**
 * 404, not 403. A caller without platform authority learns nothing about the moderation API —
 * not that it exists, not that a report id is real. The same shape the browse module uses for a
 * contractor the viewer may not see.
 */
export const moderationResourceNotFound = (): AppError =>
  new AppError('Not found', 404, 'NOT_FOUND');

/** A second moderator reached an already-resolved report. Deterministic, never a silent overwrite. */
export const reportAlreadyResolved = (): AppError =>
  new AppError('This report has already been resolved', 409, 'REPORT_ALREADY_RESOLVED');

/** The account is not in a state this transition can act on. */
export const accountActionNotApplicable = (): AppError =>
  new AppError('That account action does not apply in its current state', 409, 'ACCOUNT_ACTION_NOT_APPLICABLE');
