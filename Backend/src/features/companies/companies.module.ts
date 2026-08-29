import { Router, type RequestHandler } from 'express';

import { validateRequest } from '../../middleware/validateRequest.js';
import { companyMembershipRepository } from './companyMembership.repository.js';
import { createEmployeeManagementController } from './employeeManagement.controller.js';
import { createEmployeeManagementService } from './employeeManagement.service.js';
import { createInvitationBodySchema } from './employeeManagement.validation.js';

/**
 * Employee management. Every route is authenticated first and then checked against the caller's
 * own recorded permission, so the middleware answers *who* and the service answers *may they*.
 */
export const createCompaniesModule = (requireAccessToken: RequestHandler): Router => {
  const controller = createEmployeeManagementController(
    createEmployeeManagementService({ memberships: companyMembershipRepository }),
  );

  const router = Router();
  router.use(requireAccessToken);

  router.post('/employees/invitations', validateRequest({ body: createInvitationBodySchema }), controller.handleInvite);
  router.get('/employees', controller.handleList);
  router.post('/employees/approve-all', controller.handleApproveAll);
  router.post('/employees/:membershipId/approve', controller.handleApprove);

  return router;
};
