import { AppError } from '../../shared/errors.js';

export const templateNotFound = (): AppError =>
  new AppError('Permission template not found.', 404, 'PERMISSION_TEMPLATE_NOT_FOUND');

export const templateNameTaken = (): AppError =>
  new AppError('A template with that name already exists.', 409, 'PERMISSION_TEMPLATE_NAME_TAKEN');

/**
 * Removing your own last authority on a project would lock you out of the surface that could give
 * it back — an irreversible action with no undo. Somebody else holding grant authority can still
 * reduce or revoke you; you simply cannot do it to yourself.
 */
export const cannotRemoveOwnAuthority = (): AppError =>
  new AppError(
    'You cannot remove your own management authority on a project.',
    409,
    'CANNOT_REMOVE_OWN_AUTHORITY',
  );
