import type { RequestHandler, Response } from 'express';

import type { CredentialState } from '../users/user.repository.js';
import { unauthenticated } from './auth.errors.js';
import { isSessionPermitted } from './auth.service.js';
import type { AccessTokenService } from './tokens/accessToken.service.js';
import { accessTokenVersionOf, type AccessTokenClaims } from './tokens/token.types.js';

const BEARER_PREFIX = 'Bearer ';

export interface AuthenticatedRequestContext {
  readonly userId: string;
}

/** The one thing this middleware asks the database for. Narrow by design. */
export interface CredentialStateReader {
  findCredentialState(id: string): Promise<CredentialState | null>;
}

const readBearerToken = (header: string | undefined): string | null => {
  if (header === undefined || !header.startsWith(BEARER_PREFIX)) return null;

  const token = header.slice(BEARER_PREFIX.length).trim();
  return token.length > 0 ? token : null;
};

/**
 * Integer equality, so no clock is consulted and no two events can share a tick. A token carrying
 * no `ver` reads as the initial version, which is what an account that has never reset sits at.
 */
const carriesCurrentVersion = (claims: AccessTokenClaims, current: number): boolean =>
  accessTokenVersionOf(claims) === current;

/**
 * Answers one question — *who is making this request?* — and stops there. It resolves no roles, no
 * project membership and no permissions: authorization is a separate concern with different inputs,
 * and folding it in here is what makes an auth middleware impossible to reuse later.
 *
 * A Refresh Token presented here fails at the `verify` call, because that call uses the Access
 * Token secret and then insists on `typ: 'access'`.
 *
 * A valid signature is necessary and no longer sufficient. An Access Token is stateless, so
 * nothing that happens to the account can reach one already in circulation — so every accepted
 * token is checked against the account's current state: it must still be permitted a session, by
 * the same `isSessionPermitted` rule Login and Refresh apply, and it must carry the account's
 * current token version. That costs one indexed lookup per authenticated request.
 */
export const createRequireAccessToken = (
  accessTokens: AccessTokenService,
  users: CredentialStateReader,
): RequestHandler =>
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

    void users
      .findCredentialState(claims.sub)
      .then((state) => {
        // No such account, an account no longer permitted a session, or a token retired by a
        // credential change: none of the three may proceed.
        if (
          state === null ||
          !isSessionPermitted(state) ||
          !carriesCurrentVersion(claims, state.tokenVersion)
        ) {
          next(unauthenticated());
          return;
        }

        res.locals.auth = { userId: claims.sub } satisfies AuthenticatedRequestContext;
        next();
      })
      .catch(next);
  };

/** Mirrors `getValidated` from the foundation: read what the middleware proved, or fail loudly. */
export const getAuthenticatedUserId = (res: Response): string => {
  const auth = res.locals.auth as AuthenticatedRequestContext | undefined;

  if (auth === undefined) {
    throw new Error('Route read an authenticated user that requireAccessToken never produced.');
  }

  return auth.userId;
};
