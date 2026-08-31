import { AppError } from '../../shared/errors.js';

export const alreadyOnProject = (): AppError =>
  new AppError('That person is already on this project.', 409, 'ALREADY_ON_PROJECT');

export const invitationNotOpen = (): AppError =>
  new AppError('That invitation is no longer open.', 409, 'INVITATION_NOT_OPEN');

/** A block is a wall everywhere else in the platform, and a project invitation does not go round it. */
export const participantBlocked = (): AppError =>
  new AppError('That person cannot be invited to this project.', 409, 'PARTICIPANT_BLOCKED');

export const cannotInviteSelf = (): AppError =>
  new AppError('You are already on this project.', 409, 'ALREADY_ON_PROJECT');

export const participantNotFound = (): AppError =>
  new AppError('No such account.', 404, 'PARTICIPANT_NOT_FOUND');

/**
 * A membership the caller may not act on answers exactly as one that does not exist, so the
 * response cannot be used to discover who is on a project (D16).
 */
export const membershipNotFound = (): AppError =>
  new AppError('Membership not found.', 404, 'MEMBERSHIP_NOT_FOUND');
