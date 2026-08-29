import type { Request, RequestHandler, Response } from 'express';

import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import type { DashboardService } from './dashboard.service.js';

export interface DashboardController {
  readonly handleSummary: RequestHandler;
  readonly handleDismissProfileReminder: RequestHandler;
}

export const createDashboardController = (service: DashboardService): DashboardController => ({
  handleSummary: async (req: Request, res: Response) => {
    const dashboard = await service.forUser(getAuthenticatedUserId(res));

    res.json({ dashboard });
  },

  handleDismissProfileReminder: async (req: Request, res: Response) => {
    const profileReminder = await service.dismissProfileReminder(getAuthenticatedUserId(res));

    res.json({ profileReminder });
  },
});