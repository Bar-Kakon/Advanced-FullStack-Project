import { Router, type RequestHandler } from 'express';

import { validateRequest } from '../../middleware/validateRequest.js';
import { reportRepository } from '../reports/report.repository.js';
import { userRepository } from '../users/user.repository.js';
import { createModerationController } from './moderation.controller.js';
import { createModerationService, type ModerationService } from './moderation.service.js';
import {
  accountActionBodySchema,
  queueQuerySchema,
  reportIdParamsSchema,
  resolveBodySchema,
} from './moderation.validation.js';
import { createRequirePlatformAdmin } from './platformAuthority.js';

/**
 * Two gates, in order: a session, then platform authority. The second is mounted on the router
 * itself rather than route by route, so a route added later cannot be forgotten and left open.
 */
export const createModerationModule = (requireAccessToken: RequestHandler): Router => {
  const service: ModerationService = createModerationService({
    reports: reportRepository,
    users: userRepository,
  });
  const controller = createModerationController(service);

  const router = Router();
  router.use(requireAccessToken);
  router.use(createRequirePlatformAdmin(userRepository));

  router.get('/reports', validateRequest({ query: queueQuerySchema }), controller.handleQueue);

  router.get(
    '/reports/:reportId',
    validateRequest({ params: reportIdParamsSchema }),
    controller.handleDetail,
  );

  router.post(
    '/reports/:reportId/claim',
    validateRequest({ params: reportIdParamsSchema }),
    controller.handleClaim,
  );

  router.post(
    '/reports/:reportId/resolve',
    validateRequest({ params: reportIdParamsSchema, body: resolveBodySchema }),
    controller.handleResolve,
  );

  router.post(
    '/reports/:reportId/account-action',
    validateRequest({ params: reportIdParamsSchema, body: accountActionBodySchema }),
    controller.handleAccountAction,
  );

  return router;
};