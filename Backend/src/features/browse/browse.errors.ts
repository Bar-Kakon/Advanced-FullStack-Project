import { AppError } from '../../shared/errors.js';

/** Not found rather than forbidden: a blocked or inactive person discloses nothing by existing. */
export const contractorNotFound = (): AppError =>
  new AppError('No such contractor', 404, 'CONTRACTOR_NOT_FOUND');

/** A driving-distance filter needs both an origin and a limit. */
export const incompleteDistanceFilter = (): AppError =>
  new AppError('A driving-distance filter needs both an origin and a maximum', 400, 'INCOMPLETE_DISTANCE_FILTER');
