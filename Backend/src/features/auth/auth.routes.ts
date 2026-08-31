import { Router, type RequestHandler } from 'express';

import { createAuthRateLimiter } from '../../middleware/rateLimit.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import type { AuthController } from './auth.controller.js';
import {
  forgotPasswordBodySchema,
  googleCredentialBodySchema,
  loginBodySchema,
  registerBodySchema,
  resetPasswordBodySchema,
} from './auth.validation.js';

/**
 * `validateRequest` sits in front of the Register and Login handlers, so an ill-formed body is
 * rejected by the foundation's validation boundary before any credential logic — or any bcrypt
 * cost, or any write — is reached.
 *
 * The refresh route carries no schema because it carries no request body: its only input is the
 * HttpOnly cookie, which is verified cryptographically rather than shape-checked.
 */
export const createAuthRouter = (
  controller: AuthController,
  requireAccessToken: RequestHandler,
): Router => {
  const router = Router();

  // The limiter sits in front of validation, so a flood costs a counter increment rather than a
  // JOI pass — and, on login, never reaches bcrypt.
  router.post(
    '/register',
    createAuthRateLimiter('register'),
    validateRequest({ body: registerBodySchema }),
    controller.handleRegister,
  );
  router.post(
    '/login',
    createAuthRateLimiter('login'),
    validateRequest({ body: loginBodySchema }),
    controller.handleLogin,
  );
  // `/refresh` is deliberately not limited: it is spent by an HttpOnly cookie the browser sends on
  // its own, and rotation plus family revocation already answer a replayed one.
  router.post('/refresh', controller.handleRefresh);

  // Unauthenticated on purpose: an expired Access Token must not trap somebody in a session.
  router.post('/logout', controller.handleLogout);

  /*
   * Google sign-in sits beside Login rather than replacing it, and ends at the same place: a token
   * pair and the same Refresh cookie. It is limited like Login because each attempt costs a
   * signature verification.
   */
  router.post(
    '/google',
    createAuthRateLimiter('googleSignIn'),
    validateRequest({ body: googleCredentialBodySchema }),
    controller.handleGoogleSignIn,
  );

  // Authenticated: linking requires proving the FieldSync account first, which is what makes the
  // link safe on an email registration never verified.
  router.post(
    '/google/link',
    requireAccessToken,
    validateRequest({ body: googleCredentialBodySchema }),
    controller.handleGoogleLink,
  );

  // The only authenticated route in this feature, and the only one that reads rather than writes.
  router.get('/me', requireAccessToken, controller.handleMe);

  router.post(
    '/forgot-password',
    createAuthRateLimiter('forgotPassword'),
    validateRequest({ body: forgotPasswordBodySchema }),
    controller.handleForgotPassword,
  );
  router.post(
    '/reset-password',
    createAuthRateLimiter('resetPassword'),
    validateRequest({ body: resetPasswordBodySchema }),
    controller.handleResetPassword,
  );

  return router;
};
