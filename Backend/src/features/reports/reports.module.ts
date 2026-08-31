import { Router, type RequestHandler } from 'express';

import { createReportRateLimiter } from '../../middleware/rateLimit.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { userRepository } from '../users/user.repository.js';
import { reportRepository } from './report.repository.js';
import { createReportsController } from './reports.controller.js';
import { createReportsService, type ReportsService } from './reports.service.js';
import { reportUserParamsSchema, submitReportBodySchema } from './reports.validation.js';

export interface ReportsModule {
  readonly router: Router;
  readonly service: ReportsService;
}

/**
 * Submission only. There is no route here that reads, lists or resolves a report — reading is
 * moderation's job and lives behind platform authority in its own module, so no ordinary session
 * can reach a report through this router whatever it sends.
 */
export const createReportsModule = (requireAccessToken: RequestHandler): ReportsModule => {
  const service = createReportsService({ reports: reportRepository, users: userRepository });
  const controller = createReportsController(service);

  const router = Router();
  router.use(requireAccessToken);

  // The limiter sits after authentication so it can key on the account rather than the address.
  router.post(
    '/users/:userId',
    createReportRateLimiter(),
    validateRequest({ params: reportUserParamsSchema, body: submitReportBodySchema }),
    controller.handleReportUser,
  );

  return { router, service };
};