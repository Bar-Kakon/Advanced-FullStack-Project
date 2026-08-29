import { AppError } from '../../shared/errors.js';

/**
 * The standing backend rule. Hiding the control is UX; this is the enforcement, and it is checked
 * before eligibility so a direct API call cannot reach any other path.
 */
export const cannotRateSelf = (): AppError =>
  new AppError('You cannot rate yourself', 403, 'CANNOT_RATE_SELF');

/** No shared completed task entitles this caller to rate that person. */
export const notEligibleToRate = (): AppError =>
  new AppError('You are not eligible to rate this person', 403, 'RATING_NOT_ELIGIBLE');

/** One peer rating per shared completed task. */
export const alreadyRated = (): AppError =>
  new AppError('You have already rated this person for that work', 409, 'ALREADY_RATED');

/** The person named does not exist. */
export const rateeNotFound = (): AppError =>
  new AppError('No such user', 404, 'USER_NOT_FOUND');
