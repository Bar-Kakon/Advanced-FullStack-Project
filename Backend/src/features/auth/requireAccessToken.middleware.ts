import type { RequestHandler, Response } from 'express';

import type { CredentialState } from '../users/user.repository.js';
import { unauthenticated } from './auth.errors.js';
import type { AccessTokenService } from './tokens/accessToken.service.js';

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
 * Both sides are whole seconds: `iat` is, and `passwordChangedAt` is stored truncated to match.
 * A token from any earlier second is dead. One minted in the same second as the reset survives —
 * the granularity of `iat` is what limits this, and rounding the other way would instead reject
 * the token Login mints moments after a reset.
 */
const issuedBeforePasswordChange = (issuedAtSeconds: number, passwordChangedAt: Date | null): boolean =>
  passwordChangedAt !== null && issuedAtSeconds * 1000 < passwordChangedAt.getTime();

/**
 * Answers one question — *who is making this request?* — and stops there. It resolves no roles, no
 * project membership and no permissions: authorization is a separate concern with different inputs,
 * and folding it in here is what makes an auth middleware impossible to reuse later.
 *
 * A Refresh Token presented here fails at the `verify` call, because that call uses the Access
 * Token secret and then insists on `typ: 'access'`.
 *
 * A valid signature is necessary and no longer sufficient: an Access Token is stateless, so a
 * password reset cannot reach one that is already in circulation. Every accepted token is checked
 * against the account's own record of when its password last changed, which costs one indexed
 * lookup per authenticated request.
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
        // No such account, or a token predating the current password: neither may proceed.
        if (state === null || issuedBeforePasswordChange(claims.iat, state.passwordChangedAt)) {
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
