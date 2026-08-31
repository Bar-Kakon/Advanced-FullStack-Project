import { Router, type Request, type Response } from 'express';

import { getDatabaseStatus } from '../db/mongoose.js';

export const handleHealthCheck = (_req: Request, res: Response): void => {
  res.json({
    status: 'ok',
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    database: getDatabaseStatus(),
  });
};

export const createHealthRouter = (): Router => {
  const router = Router();
  router.get('/', handleHealthCheck);
  return router;
};
