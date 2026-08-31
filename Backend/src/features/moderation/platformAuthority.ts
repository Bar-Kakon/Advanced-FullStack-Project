import type { RequestHandler } from 'express';

import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { moderationResourceNotFound } from './moderation.errors.js';

/** The one thing this middleware asks the database for. */
export interface PlatformAuthorityReader {
  isPlatformAdmin(id: string): Promise<boolean>;
}

/**
 * Platform authority is a property of the account and of nothing else. It is read from `isAdmin`
 * on every request rather than carried in the Access Token, so removing it takes effect on the
 * next call instead of when a token happens to expire — and so no request payload can assert it.
 *
 * Deliberately unrelated to every project and company surface. A Full Project Authority grant, a
 * `main_contractor` project role, a `company.*` permission and a `companyPosition` all describe a
 * relationship inside one piece of work; moderation is authority over the platform itself, and
 * inferring one from the other is how a general contractor ends up reading another firm's reports.
 *
 * It answers 404, not 403, matching the browse module: a caller who is not a moderator learns
 * neither that this API exists nor that any id they name is real.
 */
export const createRequirePlatformAdmin = (users: PlatformAuthorityReader): RequestHandler =>
  (_req, res, next) => {
    void users
      .isPlatformAdmin(getAuthenticatedUserId(res))
      .then((isAdmin) => next(isAdmin ? undefined : moderationResourceNotFound()))
      .catch(next);
  };