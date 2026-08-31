import type { Request, RequestHandler, Response } from 'express';

import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { getValidated } from '../../middleware/validateRequest.js';
import type { EmployeeManagementService } from './employeeManagement.service.js';
import type { CreateInvitationBody } from './employeeManagement.validation.js';

export interface EmployeeManagementController {
  readonly handleInvite: RequestHandler;
  readonly handleList: RequestHandler;
  readonly handleApprove: RequestHandler;
  readonly handleApproveAll: RequestHandler;
  readonly handleCancelInvitation: RequestHandler;
  readonly handleCompleteSetup: RequestHandler;
}

/** Reads who is calling, calls one use case, and places the result in a response. Nothing else. */
export const createEmployeeManagementController = (
  service: EmployeeManagementService,
): EmployeeManagementController => ({
  handleInvite: async (req: Request, res: Response) => {
    const input = getValidated<CreateInvitationBody>(res, 'body');
    const invitationId = await service.invite(getAuthenticatedUserId(res), input);

    res.status(201).json({ invitationId: invitationId.toString() });
  },

  handleList: async (req: Request, res: Response) => {
    const memberships = await service.list(getAuthenticatedUserId(res));

    res.json({
      memberships: memberships.map((membership) => ({
        id: membership._id.toString(),
        status: membership.status,
        standing: membership.standing,
        invitedFullName: membership.invitedFullName ?? null,
        companyPosition: membership.companyPosition ?? null,
        userId: membership.user?.toString() ?? null,
      })),
    });
  },

  handleApprove: async (req: Request, res: Response) => {
    // Express types a route parameter as possibly repeated; this one never is.
    const membershipId = req.params['membershipId'];
    const approved = await service.approve(
      getAuthenticatedUserId(res),
      typeof membershipId === 'string' ? membershipId : '',
    );

    res.json({ approved });
  },

  handleCancelInvitation: async (req: Request, res: Response) => {
    const membershipId = req.params['membershipId'];
    await service.cancelInvitation(
      getAuthenticatedUserId(res),
      typeof membershipId === 'string' ? membershipId : '',
    );

    res.json({ cancelled: true });
  },

  handleApproveAll: async (req: Request, res: Response) => {
    const approved = await service.approveAllPending(getAuthenticatedUserId(res));

    res.json({ approved });
  },

  /** Idempotent, so a client that repeats it after a dropped response is not an error case. */
  handleCompleteSetup: async (req: Request, res: Response) => {
    await service.completeEmployeeSetup(getAuthenticatedUserId(res));

    res.json({ employeeSetupComplete: true });
  },
});
