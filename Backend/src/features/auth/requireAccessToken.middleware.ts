import type { RequestHandler, Response } from 'express';

import { unauthenticated } from './auth.errors.js';
import type { AccessTokenService } from './tokens/accessToken.service.js';

const BEARER_PREFIX = 'Bearer ';

export interface AuthenticatedRequestContext {
  readonly userId: string;
}

const readBearerToken = (header: string | undefined): string | null => {
  if (header === undefined || !header.startsWith(BEARER_PREFIX)) return null;

  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
};

/**
 * Answers one question — *who is making this request?* — and stops there. It resolves no roles, no
 * project membership and no permissions: authorization is a separate concern with different inputs,
 * and folding it in here is what makes an auth middleware impossible to reuse later.
 *
 * A Refresh Token presented here fails at the `verify` call, because that call uses the Access
 * Token secret and then insists on `typ: 'access'`.
 */
export const createRequireAccessToken = (accessTokens: AccessTokenService): RequestHandler =>
  (req, res, next) => {
    const token = readBearerToken(req.headers.authorization);
    if (token === null) {
      next(unauthenticated());
      return;
    }

    const claims = accessTokens.verify(token);
    if (claims === null) {
      next(unauthenticated());
      return;
    }

    res.locals.auth = { userId: claims.sub } satisfies AuthenticatedRequestContext;
    next();
  };

/** Mirrors `getValidated` from the foundation: read what the middleware proved, or fail loudly. */
export const getAuthenticatedUserId = (res: Response): string => {
  const auth = res.locals.auth as AuthenticatedRequestContext | undefined;

  if (auth === undefined) {
    throw new Error('Route read an authenticated user that requireAccessToken never produced.');
  }

  return auth.userId;
};
