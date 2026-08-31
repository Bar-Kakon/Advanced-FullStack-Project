import { AppError } from '../../shared/errors.js';

/** Blocking yourself is not a state this model has. */
export const cannotBlockSelf = (): AppError =>
  new AppError('You cannot block yourself', 400, 'CANNOT_BLOCK_SELF');

/** The same block already exists, so there is nothing to create. */
export const alreadyBlocked = (): AppError =>
  new AppError('That person is already blocked', 409, 'ALREADY_BLOCKED');

/** Unblocking a person this caller never blocked. */
export const blockNotFound = (): AppError =>
  new AppError('No block to remove', 404, 'BLOCK_NOT_FOUND');

/** The person named does not exist. */
export const blockTargetNotFound = (): AppError =>
  new AppError('No such user', 404, 'USER_NOT_FOUND');
