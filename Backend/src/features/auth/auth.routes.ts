import { Router } from 'express';

import { validateRequest } from '../../middleware/validateRequest.js';
import type { AuthController } from './auth.controller.js';
import { loginBodySchema } from './auth.validation.js';

/**
 * `validateRequest` sits in front of the Login handler, so an ill-formed body is rejected by the
 * foundation's validation boundary before any credential logic — or any bcrypt cost — is reached.
 *
 * The refresh route carries no schema because it carries no request body: its only input is the
 * HttpOnly cookie, which is verified cryptographically rather than shape-checked.
 */
export const createAuthRouter = (controller: AuthController): Router => {
  const router = Router();

  router.post('/login', validateRequest({ body: loginBodySchema }), controller.handleLogin);
  router.post('/refresh', controller.handleRefresh);

  return router;
};
