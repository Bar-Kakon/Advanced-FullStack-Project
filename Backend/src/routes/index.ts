import { Router } from 'express';

import { createHealthRouter } from './health.routes.js';

/**
 * The API composition root. A feature module is mounted here with a single line
 * (`router.use('/auth', createAuthRouter())`) and nothing else in the bootstrap changes.
 */
export const createApiRouter = (): Router => {
  const router = Router();
  router.use('/health', createHealthRouter());
  return router;
};
