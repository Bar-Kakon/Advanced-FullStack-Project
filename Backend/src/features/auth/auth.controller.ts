import type { Request, RequestHandler, Response } from 'express';

import { getValidated } from '../../middleware/validateRequest.js';
import type { AuthService } from './auth.service.js';
import type { LoginBody } from './auth.validation.js';
import { REFRESH_TOKEN_COOKIE, type RefreshTokenCookie } from './refreshTokenCookie.js';

export interface AuthController {
  readonly handleLogin: RequestHandler;
  readonly handleRefresh: RequestHandler;
}

/**
 * The HTTP boundary and nothing more: read what was already validated, call one use case, and place
 * the result into a response. No query, no bcrypt call, no signing, no `process.env`.
 *
 * Deciding that the Refresh Token travels in a cookie is a transport concern, which is why it is
 * settled here and in `refreshTokenCookie.ts` rather than inside the service.
 */
export const createAuthController = (authService: AuthService, cookie: RefreshTokenCookie): AuthController => {
  const sendRefreshToken = (res: Response, refreshToken: string): void => {
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, cookie.options);
  };

  return {
    handleLogin: async (req: Request, res: Response) => {
      const credentials = getValidated<LoginBody>(res, 'body');
      const { accessToken, refreshToken, user } = await authService.login(credentials);

      sendRefreshToken(res, refreshToken);
      res.json({ accessToken, user });
    },

    handleRefresh: async (req: Request, res: Response) => {
      const { accessToken, refreshToken } = await authService.refresh(cookie.read(req));

      sendRefreshToken(res, refreshToken);
      res.json({ accessToken });
    },
  };
};
