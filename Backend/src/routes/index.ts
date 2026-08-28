import { Router } from 'express';

import type { AppConfig } from '../config/env.js';
import { createAuthModule } from '../features/auth/auth.module.js';
import { createHealthRouter } from './health.routes.js';
import { createHealthAuthRouter } from './healthAuth.routes.js';

/**
 * The API composition root. A feature module is mounted here with a single line and nothing else in
 * the bootstrap changes.
 */
export const createApiRouter = (config: AppConfig): Router => {
  const router = Router();
  const auth = createAuthModule(config);

  router.use('/health', createHealthRouter());
  router.use('/health-auth', createHealthAuthRouter(auth.requireAccessToken));
  router.use('/auth', auth.router);

  return router;
};
