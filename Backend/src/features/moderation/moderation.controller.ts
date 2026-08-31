import type { Request, RequestHandler, Response } from 'express';

import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { getValidated } from '../../middleware/validateRequest.js';
import type { ModerationService } from './moderation.service.js';
import type {
  AccountActionBody,
  QueueQueryInput,
  ReportIdParams,
  ResolveBody,
} from './moderation.validation.js';

export interface ModerationController {
  readonly handleQueue: RequestHandler;
  readonly handleDetail: RequestHandler;
  readonly handleClaim: RequestHandler;
  readonly handleResolve: RequestHandler;
  readonly handleAccountAction: RequestHandler;
}

export const createModerationController = (service: ModerationService): ModerationController => ({
  handleQueue: async (req: Request, res: Response) => {
    const query = getValidated<QueueQueryInput>(res, 'query');
    res.json({ reports: await service.queue(query) });
  },

  handleDetail: async (req: Request, res: Response) => {
    const { reportId } = getValidated<ReportIdParams>(res, 'params');
    res.json({ report: await service.detail(reportId) });
  },

  handleClaim: async (req: Request, res: Response) => {
    const { reportId } = getValidated<ReportIdParams>(res, 'params');
    res.json({ report: await service.claim(reportId, getAuthenticatedUserId(res)) });
  },

  handleResolve: async (req: Request, res: Response) => {
    const { reportId } = getValidated<ReportIdParams>(res, 'params');
    const body = getValidated<ResolveBody>(res, 'body');

    res.json({ report: await service.resolve(reportId, getAuthenticatedUserId(res), body) });
  },

  handleAccountAction: async (req: Request, res: Response) => {
    const { reportId } = getValidated<ReportIdParams>(res, 'params');
    const { action, reason } = getValidated<AccountActionBody>(res, 'body');

    const report = await service.applyAccountAction(
      reportId,
      getAuthenticatedUserId(res),
      action,
      reason,
    );

    res.json({ report });
  },
});
