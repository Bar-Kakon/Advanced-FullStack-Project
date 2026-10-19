import { Router, type RequestHandler } from 'express';
import { Types } from 'mongoose';

import { runInTransaction } from '../../db/mongoose.js';
import { getValidated, validateRequest } from '../../middleware/validateRequest.js';
import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { auditRepository } from '../coordination/audit.repository.js';
import { createAgreementOriginAdapter } from '../messaging/agreementOrigin.adapter.js';
import { buildNotificationDispatchService } from '../notifications/notifications.module.js';
import { projectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import { participantRepository } from '../projectmembers/participant.repository.js';
import { projectRepository } from '../projects/project.repository.js';
import { scheduleWrites } from '../projects/scheduleWrites.instance.js';
import { commissionTrackingRepository } from '../tasks/commissionTracking.repository.js';
import { createDepartureWorkService } from '../tasks/departureWork.service.js';
import { taskRepository } from '../tasks/task.repository.js';
import { companyRepository } from './company.repository.js';
import { companyMembershipRepository } from './companyMembership.repository.js';
import { createEmployeeDepartureService } from './employeeDeparture.service.js';
import { createEmployeeManagementController } from './employeeManagement.controller.js';
import { createEmployeeManagementService } from './employeeManagement.service.js';
import {
  claimSeatBodySchema,
  createInvitationBodySchema,
  departureArrangementsBodySchema,
  departureDefaultsBodySchema,
  offboardBodySchema,
  setPermissionsBodySchema,
  type ClaimSeatBody,
  type DepartureArrangementsBody,
  type DepartureDefaultsBody,
  type OffboardBody,
} from './employeeManagement.validation.js';

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

  const origins = createAgreementOriginAdapter();
  const departures = createEmployeeDepartureService({
    memberships: companyMembershipRepository,
    companies: companyRepository,
    departureWork: createDepartureWorkService({
      tasks: taskRepository,
      origins,
      trackings: commissionTrackingRepository,
      access: projectAccessRepository,
      memberships: companyMembershipRepository,
      participants: participantRepository,
      projects: projectRepository,
      audit: auditRepository,
      notifications: buildNotificationDispatchService(),
      schedule: scheduleWrites,
    }),
    origins,
    notifications: buildNotificationDispatchService(),
    transactions: { run: runInTransaction },
    participants: participantRepository,
    findOpenInvitations: (query) => companyMembershipRepository.findOpenInvitations(query),
    claimInvitation: (invitation, user, session) =>
      companyMembershipRepository.claimInvitation(invitation, user, session),
  });

  const me = (res: Parameters<RequestHandler>[1]): string => getAuthenticatedUserId(res);
  const toDefaults = (body: DepartureDefaultsBody) => ({
    ...(body.commissioned === undefined
      ? {}
      : {
          commissioned: {
            arrangement: body.commissioned.arrangement,
            ...(body.commissioned.trackeeUserId === undefined
              ? {}
              : { trackee: new Types.ObjectId(body.commissioned.trackeeUserId) }),
          },
        }),
    ...(body.assigned?.assigneeUserId === undefined
      ? {}
      : { assigned: { assignee: new Types.ObjectId(body.assigned.assigneeUserId) } }),
  });

  const router = Router();
  router.use(requireAccessToken);

  // Departure routes come before the parameterised employee routes, so names never collide.
  router.post('/employees/me/leave', async (_req, res) => {
    await departures.leave(me(res));
    res.status(204).end();
  });

  router.post('/employees/claim', validateRequest({ body: claimSeatBodySchema }), async (_req, res) => {
    const body = getValidated<ClaimSeatBody>(res, 'body');
    await departures.claimSeat(me(res), body);
    res.status(201).json({ status: 'pending_company_approval' });
  });

  router.get('/departures/:userId/work', async (req, res) => {
    const userId = req.params['userId'];
    res.json(await departures.workFor(me(res), typeof userId === 'string' ? userId : ''));
  });

  router.post(
    '/departures/:userId/arrangements',
    validateRequest({ body: departureArrangementsBodySchema }),
    async (req, res) => {
      const userId = req.params['userId'];
      const body = getValidated<DepartureArrangementsBody>(res, 'body');
      await departures.arrange(me(res), typeof userId === 'string' ? userId : '', body);
      res.status(204).end();
    },
  );

  router.post(
    '/employees/:membershipId/offboard',
    validateRequest({ body: offboardBodySchema }),
    async (req, res) => {
      const membershipId = req.params['membershipId'];
      const body = getValidated<OffboardBody>(res, 'body');
      await departures.offboard(
        me(res),
        typeof membershipId === 'string' ? membershipId : '',
        body.arrangements,
      );
      res.status(204).end();
    },
  );

  router.put(
    '/departure-defaults',
    validateRequest({ body: departureDefaultsBodySchema }),
    async (_req, res) => {
      const body = getValidated<DepartureDefaultsBody>(res, 'body');
      await departures.setDepartureDefaults(me(res), toDefaults(body));
      res.status(204).end();
    },
  );

  router.post('/employees/invitations', validateRequest({ body: createInvitationBodySchema }), controller.handleInvite);
  router.get('/employees', controller.handleList);
  router.post('/employees/approve-all', controller.handleApproveAll);
  router.post('/employees/:membershipId/approve', controller.handleApprove);
  router.patch(
    '/employees/:membershipId/permissions',
    validateRequest({ body: setPermissionsBodySchema }),
    controller.handleSetPermissions,
  );
  router.delete('/employees/invitations/:membershipId', controller.handleCancelInvitation);

  // Not under `/employees`: it is recorded whether or not anybody was ever invited.
  router.post('/employee-setup/complete', controller.handleCompleteSetup);

  // The company's own editable fields. Last, so a named route above always wins the match.
  router.use(companyProfileRoutes);

  return router;
};
