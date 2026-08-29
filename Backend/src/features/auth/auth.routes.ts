import { Router } from 'express';

import { validateRequest } from '../../middleware/validateRequest.js';
import type { AuthController } from './auth.controller.js';
import {
  forgotPasswordBodySchema,
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
export const createAuthRouter = (controller: AuthController): Router => {
  const router = Router();

  router.post('/register', validateRequest({ body: registerBodySchema }), controller.handleRegister);
  router.post('/login', validateRequest({ body: loginBodySchema }), controller.handleLogin);
  router.post('/refresh', controller.handleRefresh);

  router.post(
    '/forgot-password',
    validateRequest({ body: forgotPasswordBodySchema }),
    controller.handleForgotPassword,
  );
  router.post(
    '/reset-password',
    validateRequest({ body: resetPasswordBodySchema }),
    controller.handleResetPassword,
  );

  return router;
};
