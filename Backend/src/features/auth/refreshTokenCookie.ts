import type { CookieOptions, Request } from 'express';

import type { NodeEnv } from '../../config/env.js';

export const REFRESH_TOKEN_COOKIE = 'refreshToken';

/**
 * Scoped to the auth routes, so the long-lived credential is not attached to every ordinary API
 * call — a request that cannot carry it cannot leak it.
 */
const COOKIE_PATH = '/api/auth';

export interface RefreshTokenCookie {
  readonly options: CookieOptions;
  read(req: Request): string | undefined;
}

/**
 * In production the client (Vercel) and the API (Heroku) are different sites, and a cross-site
 * cookie is only sent when it is `SameSite=None; Secure`. Locally both sides are `localhost`, where
 * `Secure` would stop the cookie being stored over plain HTTP — hence the split rather than one
 * setting that is wrong in one of the two places.
 */
export const createRefreshTokenCookie = (nodeEnv: NodeEnv, ttlSeconds: number): RefreshTokenCookie => {
  const isProduction = nodeEnv === 'production';

  return {
    options: {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? 'none' : 'lax',
      path: COOKIE_PATH,
      maxAge: ttlSeconds * 1000,
    },
    read: (req) => {
      const cookies = req.cookies as Record<string, unknown> | undefined;
      const value = cookies?.[REFRESH_TOKEN_COOKIE];
      return typeof value === 'string' && value.length > 0 ? value : undefined;
    },
  };
};
