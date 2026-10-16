import { Router, type Request, type Response } from 'express';

import { getDatabaseStatus } from '../db/mongoose.js';

export const createHealthCheck = (localDatabase: boolean) => (_req: Request, res: Response): void => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    database: getDatabaseStatus(),
    ...(localDatabase ? { localDatabase: true } : {}),
  });
};

export const handleHealthCheck = createHealthCheck(false);

export const createHealthRouter = (localDatabase = false): Router => {
  const router = Router();
  router.get('/', createHealthCheck(localDatabase));
  return router;
};
