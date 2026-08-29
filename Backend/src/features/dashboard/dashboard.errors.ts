import { AppError } from '../../shared/errors.js';

export const dashboardUserNotFound = (): AppError =>
  new AppError('No such user', 404, 'USER_NOT_FOUND');
