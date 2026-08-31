import { AppError } from '../../shared/errors.js';

/** Reporting yourself is not a moderation signal. */
export const cannotReportSelf = (): AppError =>
  new AppError('You cannot report yourself', 400, 'CANNOT_REPORT_SELF');

/** Not found rather than forbidden: an id must never confirm that an account exists. */
export const reportSubjectNotFound = (): AppError =>
  new AppError('No such user', 404, 'REPORT_SUBJECT_NOT_FOUND');

/** The same reporter already has this exact report open against this subject. */
export const duplicateOpenReport = (): AppError =>
  new AppError('You have already reported this, and it is still being reviewed', 409, 'DUPLICATE_OPEN_REPORT');
