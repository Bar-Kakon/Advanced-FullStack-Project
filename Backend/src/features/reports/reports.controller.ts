import type { Request, RequestHandler, Response } from 'express';

import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { getValidated } from '../../middleware/validateRequest.js';
import type { ReportsService } from './reports.service.js';
import type { ReportUserParams, SubmitReportBody } from './reports.validation.js';

export interface ReportsController {
  readonly handleReportUser: RequestHandler;
}

export const createReportsController = (service: ReportsService): ReportsController => ({
  /**
   * 201 with the receipt and nothing else. The reporter is never told the moderation status, who
   * else has reported the same person, or that any earlier report exists.
   */
  handleReportUser: async (req: Request, res: Response) => {
    const { userId } = getValidated<ReportUserParams>(res, 'params');
    const body = getValidated<SubmitReportBody>(res, 'body');

    const report = await service.submitUserReport(getAuthenticatedUserId(res), userId, body);

    res.status(201).json({ report });
  },
});