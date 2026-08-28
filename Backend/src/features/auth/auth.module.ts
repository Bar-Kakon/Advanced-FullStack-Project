import type { Router, RequestHandler } from 'express';

import type { AppConfig } from '../../config/env.js';
import { runInTransaction } from '../../db/mongoose.js';
import { companyRepository } from '../companies/company.repository.js';
import { companyMembershipRepository } from '../companies/companyMembership.repository.js';
import { userRepository } from '../users/user.repository.js';
import { createAuthController } from './auth.controller.js';
import { createAuthRouter } from './auth.routes.js';
import { createAuthService } from './auth.service.js';
import { passwordService } from './password.service.js';
import { refreshTokenRepository } from './refreshToken.repository.js';
import { createRefreshTokenCookie } from './refreshTokenCookie.js';
import { createRegistrationService } from './registration.service.js';
import { createRequireAccessToken } from './requireAccessToken.middleware.js';
import { createAccessTokenService } from './tokens/accessToken.service.js';
import { createRefreshTokenService } from './tokens/refreshToken.service.js';
import { createTokenPairService } from './tokens/tokenPair.service.js';

export interface AuthModule {
  readonly router: Router;
  /** Exported so protected routes elsewhere reuse this exact verification, never their own copy. */
  readonly requireAccessToken: RequestHandler;
}

/**
 * The auth feature's composition root: the one place its parts are wired together. Config arrives
 * as an argument, which is what keeps every other file in this feature free of `process.env` and
 * lets a test hand the whole feature different secrets without touching the environment.
 *
 * Register and Login are two use cases over one `tokenPair` instance, so a session opened by
 * signing up is the same kind of session as one opened by logging in.
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

  const tokenPair = createTokenPairService({
    accessTokens,
    refreshTokens,
    refreshTokenStore: refreshTokenRepository,
  });

  const authService = createAuthService({
    users: userRepository,
    passwords: passwordService,
    refreshTokens,
    refreshTokenStore: refreshTokenRepository,
    tokenPair,
  });

  const registrationService = createRegistrationService({
    users: userRepository,
    companies: companyRepository,
    memberships: companyMembershipRepository,
    passwords: passwordService,
    tokenPair,
    transactions: { run: runInTransaction },
    termsVersion: config.terms.version,
  });

  const cookie = createRefreshTokenCookie(config.nodeEnv, config.tokens.refreshTtlSeconds);

  return {
    router: createAuthRouter(createAuthController({ authService, registrationService, cookie })),
    requireAccessToken: createRequireAccessToken(accessTokens),
  };
};
