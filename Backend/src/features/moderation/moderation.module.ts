import { Router, type RequestHandler } from 'express';

import { validateRequest } from '../../middleware/validateRequest.js';
import { reportRepository } from '../reports/report.repository.js';
import { userRepository } from '../users/user.repository.js';
import { createAccountLifecycleService } from '../users/accountLifecycle.service.js';
import { createModerationController } from './moderation.controller.js';
import { platformAuditService } from './platformAudit.instance.js';
import { createModerationService, type ModerationService } from './moderation.service.js';
import {
  accountActionBodySchema,
  auditQuerySchema,
  queueQuerySchema,
  reportIdParamsSchema,
  resolveBodySchema,
  restoreAccountBodySchema,
  userIdParamsSchema,
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
    audit: platformAuditService,
  });
  const lifecycle = createAccountLifecycleService({
    users: userRepository,
    audit: platformAuditService,
  });
  const controller = createModerationController(service, platformAuditService, lifecycle);

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

  router.get('/audit', validateRequest({ query: auditQuerySchema }), controller.handleAuditLog);

  router.post(
    '/accounts/:userId/restore',
    validateRequest({ params: userIdParamsSchema, body: restoreAccountBodySchema }),
    controller.handleRestoreAccount,
  );

  return router;
};