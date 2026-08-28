import type { Router, RequestHandler } from 'express';

import type { AppConfig } from '../../config/env.js';
import { userRepository } from '../users/user.repository.js';
import { createAuthController } from './auth.controller.js';
import { createAuthRouter } from './auth.routes.js';
import { createAuthService } from './auth.service.js';
import { passwordService } from './password.service.js';
import { refreshTokenRepository } from './refreshToken.repository.js';
import { createRefreshTokenCookie } from './refreshTokenCookie.js';
import { createRequireAccessToken } from './requireAccessToken.middleware.js';
import { createAccessTokenService } from './tokens/accessToken.service.js';
import { createRefreshTokenService } from './tokens/refreshToken.service.js';

export interface AuthModule {
  readonly router: Router;
  /** Exported so protected routes elsewhere reuse this exact verification, never their own copy. */
  readonly requireAccessToken: RequestHandler;
}

/**
 * The auth feature's composition root: the one place its parts are wired together. Config arrives
 * as an argument, which is what keeps every other file in this feature free of `process.env` and
 * lets a test hand the whole feature different secrets without touching the environment.
 */
export const createAuthModule = (config: AppConfig): AuthModule => {
  const accessTokens = createAccessTokenService({
    secret: config.tokens.accessSecret,
    ttlSeconds: config.tokens.accessTtlSeconds,
  });

  const refreshTokens = createRefreshTokenService({
    secret: config.tokens.refreshSecret,
    ttlSeconds: config.tokens.refreshTtlSeconds,
  });

  const authService = createAuthService({
    users: userRepository,
    passwords: passwordService,
    accessTokens,
    refreshTokens,
    refreshTokenStore: refreshTokenRepository,
  });

  const cookie = createRefreshTokenCookie(config.nodeEnv, config.tokens.refreshTtlSeconds);

  return {
    router: createAuthRouter(createAuthController(authService, cookie)),
    requireAccessToken: createRequireAccessToken(accessTokens),
  };
};
