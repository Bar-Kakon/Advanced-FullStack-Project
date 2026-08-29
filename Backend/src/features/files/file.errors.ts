import { AppError } from '../../shared/errors.js';

/** The uploaded bytes were not something this feature accepts. Shape-of-request, so 400. */
export const unsupportedFileType = (): AppError =>
  new AppError('Unsupported file type', 400, 'UNSUPPORTED_FILE_TYPE');

export const fileTooLarge = (): AppError =>
  new AppError('File exceeds the maximum allowed size', 413, 'FILE_TOO_LARGE');

/** A multipart field this route does not define, or more files than it accepts. */
export const unexpectedFileField = (): AppError =>
  new AppError('Unexpected file field', 400, 'UNEXPECTED_FILE_FIELD');

/** The asset exists, or does not, and either way it is not this caller's. Never 404-vs-403. */
export const fileNotAvailable = (): AppError =>
  new AppError('File is not available', 404, 'FILE_NOT_FOUND');
