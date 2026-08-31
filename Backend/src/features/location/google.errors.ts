import { AppError } from '../../shared/errors.js';

/** Google did not answer in time, or answered with a failure. Recoverable, never a business fact. */
export const locationServiceUnavailable = (): AppError =>
  new AppError('The location service is unavailable', 503, 'LOCATION_SERVICE_UNAVAILABLE');

/** Google rejected the place identifier the client supplied. */
export const invalidPlaceId = (): AppError =>
  new AppError('That location could not be resolved', 400, 'INVALID_PLACE_ID');

/** No server-side Google credential is configured, so no live call can be made. */
export const locationServiceNotConfigured = (): AppError =>
  new AppError('The location service is not configured', 503, 'LOCATION_SERVICE_NOT_CONFIGURED');