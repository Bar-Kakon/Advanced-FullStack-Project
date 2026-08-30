import { AppError } from '../../shared/errors.js';

export const templateNotFound = (): AppError =>
  new AppError('Permission template not found.', 404, 'PERMISSION_TEMPLATE_NOT_FOUND');

export const templateNameTaken = (): AppError =>
  new AppError('A template with that name already exists.', 409, 'PERMISSION_TEMPLATE_NAME_TAKEN');
