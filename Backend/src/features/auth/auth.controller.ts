import type { Request, RequestHandler, Response } from 'express';

import { getValidated } from '../../middleware/validateRequest.js';
import { getAuthenticatedUserId } from './requireAccessToken.middleware.js';
import type { AuthService } from './auth.service.js';
import type {
  ForgotPasswordBody,
  LoginBody,
  RegisterBody,
  ResetPasswordBody,
} from './auth.validation.js';
import type { PasswordResetService } from './passwordReset.service.js';
import type { RegistrationService } from './registration.service.js';
import { REFRESH_TOKEN_COOKIE, type RefreshTokenCookie } from './refreshTokenCookie.js';

export interface AuthController {
  readonly handleRegister: RequestHandler;
  readonly handleLogin: RequestHandler;
  readonly handleRefresh: RequestHandler;
  readonly handleLogout: RequestHandler;
  readonly handleMe: RequestHandler;
  readonly handleForgotPassword: RequestHandler;
  readonly handleResetPassword: RequestHandler;
}

export interface AuthControllerDependencies {
  readonly authService: AuthService;
  readonly registrationService: RegistrationService;
  readonly passwordResetService: PasswordResetService;
  readonly cookie: RefreshTokenCookie;
}

/**
 * The HTTP boundary and nothing more: read what was already validated, call one use case, and place
 * the result into a response. No query, no bcrypt call, no signing, no `process.env`.
 *
 * Deciding that the Refresh Token travels in a cookie is a transport concern, which is why it is
 * settled here and in `refreshTokenCookie.ts` rather than inside the services.
 */
export const createAuthController = ({
  authService,
  registrationService,
  passwordResetService,
  cookie,
}: AuthControllerDependencies): AuthController => {
  const sendRefreshToken = (res: Response, refreshToken: string): void => {
    res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, cookie.options);
  };

  return {
    /** 201: an account exists. No session — Login is the only thing that authenticates. */
    handleRegister: async (req: Request, res: Response) => {
      const input = getValidated<RegisterBody>(res, 'body');
      const { user } = await registrationService.register(input);

      res.status(201).json({ user });
    },

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

    /**
     * Always 204, whether or not the cookie named a live session. The cookie is cleared either
     * way, so a client that repeats this is in the same state as one that did it once.
     */
    handleLogout: async (req: Request, res: Response) => {
      await authService.logout(cookie.read(req));

      res.clearCookie(REFRESH_TOKEN_COOKIE, cookie.clearOptions);
      res.status(204).send();
    },

    /** A read: who the caller is now. Nothing is issued and the Refresh cookie is untouched. */
    handleMe: async (req: Request, res: Response) => {
      const user = await authService.currentUser(getAuthenticatedUserId(res));

      res.json({ user });
    },

    /** Always 200, and always the same body. The answer carries no fact about the address. */
    handleForgotPassword: async (req: Request, res: Response) => {
      const input = getValidated<ForgotPasswordBody>(res, 'body');
      await passwordResetService.requestReset(input);

      res.json({ status: 'ok' });
    },

    /** 200 on success. Nothing is issued — the person signs in with the new password. */
    handleResetPassword: async (req: Request, res: Response) => {
      const input = getValidated<ResetPasswordBody>(res, 'body');
      await passwordResetService.resetPassword(input);

      res.json({ status: 'ok' });
    },
  };
};
