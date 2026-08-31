import type { RequestHandler } from 'express';

import { AppError } from '../../shared/errors.js';
import { getAuthenticatedStatus } from '../auth/requireAccessToken.middleware.js';
import type { UserStatus } from '../users/user.model.js';

/**
 * What a restricted account is refused. The approved rule names exactly three things — discovery,
 * new connections and new projects — so this is the whole list, and nothing here reaches work that
 * has already been committed.
 */
export const restrictedAccount = (): AppError =>
  new AppError('This account cannot start new work on the platform', 403, 'ACCOUNT_RESTRICTED');

export const isRestricted = (status: UserStatus): boolean => status === 'restricted';

/**
 * Mounted on the routes that start something new. It costs no query: `requireAccessToken` has
 * already read the account state on this request, so the guard reads what that lookup proved.
 *
 * It must sit after `requireAccessToken`, which is the only thing that can put the status there.
 */
export const requireUnrestricted: RequestHandler = (_req, res, next) => {
  next(isRestricted(getAuthenticatedStatus(res)) ? restrictedAccount() : undefined);
};