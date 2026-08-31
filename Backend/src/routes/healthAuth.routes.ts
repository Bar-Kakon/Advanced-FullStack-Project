import { Router, type Request, type RequestHandler, type Response } from 'express';

import { getAuthenticatedUserId } from '../features/auth/requireAccessToken.middleware.js';

/**
 * The protected test route §5 of the project document names. It exists to prove the Access Token
 * path end to end — and, just as importantly, to prove a Refresh Token cannot open it.
 */
export const handleAuthenticatedHealthCheck = (_req: Request, res: Response): void => {
  res.json({ status: 'ok', userId: getAuthenticatedUserId(res) });
};

export const createHealthAuthRouter = (requireAccessToken: RequestHandler): Router => {
  const router = Router();
  router.get('/', requireAccessToken, handleAuthenticatedHealthCheck);
  return router;
};
