import { Router, type RequestHandler } from 'express';

import { validateRequest } from '../../middleware/validateRequest.js';
import { companyRepository } from './company.repository.js';
import { companyMembershipRepository } from './companyMembership.repository.js';
import { createEmployeeManagementController } from './employeeManagement.controller.js';
import { createEmployeeManagementService } from './employeeManagement.service.js';
import { createInvitationBodySchema } from './employeeManagement.validation.js';

/**
 * Everything served under `/companies`, composed in one place. Every route is authenticated first
 * and then checked against the caller's own recorded permission, so the middleware answers *who*
 * and the service answers *may they*.
 */
export const createCompaniesModule = (
  requireAccessToken: RequestHandler,
  companyProfileRoutes: Router,
): Router => {
  const controller = createEmployeeManagementController(
    createEmployeeManagementService({
      memberships: companyMembershipRepository,
      companies: companyRepository,
    }),
  );

  const router = Router();
  router.use(requireAccessToken);

  router.post('/employees/invitations', validateRequest({ body: createInvitationBodySchema }), controller.handleInvite);
  router.get('/employees', controller.handleList);
  router.post('/employees/approve-all', controller.handleApproveAll);
  router.post('/employees/:membershipId/approve', controller.handleApprove);
  router.delete('/employees/invitations/:membershipId', controller.handleCancelInvitation);

  // Not under `/employees`: it is recorded whether or not anybody was ever invited.
  router.post('/employee-setup/complete', controller.handleCompleteSetup);

  // The company's own editable fields. Last, so a named route above always wins the match.
  router.use(companyProfileRoutes);

  return router;
};
