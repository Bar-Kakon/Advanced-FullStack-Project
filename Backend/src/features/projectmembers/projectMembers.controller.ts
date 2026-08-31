import type { Request, RequestHandler, Response } from 'express';

import { getValidated } from '../../middleware/validateRequest.js';
import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import type { ProjectRole } from '../projectaccess/projectMembership.model.js';
import type { ProjectInvitationsService } from './projectInvitations.service.js';
import type { InviteMemberInput, ProjectMembersService } from './projectMembers.service.js';

interface ProjectScopeParams {
  readonly projectId: string;
}

interface MembershipParams extends ProjectScopeParams {
  readonly membershipId: string;
}

export interface ProjectMembersController {
  readonly handleList: RequestHandler;
  readonly handleInvite: RequestHandler;
  readonly handleSetRole: RequestHandler;
  readonly handleRemove: RequestHandler;
}

export const createProjectMembersController = (
  service: ProjectMembersService,
): ProjectMembersController => ({
  handleList: async (req: Request, res: Response) => {
    const { projectId } = getValidated<ProjectScopeParams>(res, 'params');
    res.json(await service.list(getAuthenticatedUserId(res), projectId));
  },

  handleInvite: async (req: Request, res: Response) => {
    const { projectId } = getValidated<ProjectScopeParams>(res, 'params');
    const body = getValidated<InviteMemberInput>(res, 'body');
    const member = await service.invite(getAuthenticatedUserId(res), projectId, body);

    res.status(201).json({ member });
  },

  handleSetRole: async (req: Request, res: Response) => {
    const { projectId, membershipId } = getValidated<MembershipParams>(res, 'params');
    const { projectRole } = getValidated<{ projectRole: ProjectRole }>(res, 'body');
    const member = await service.setRole(
      getAuthenticatedUserId(res),
      projectId,
      membershipId,
      projectRole,
    );

    res.json({ member });
  },

  handleRemove: async (req: Request, res: Response) => {
    const { projectId, membershipId } = getValidated<MembershipParams>(res, 'params');
    await service.remove(getAuthenticatedUserId(res), projectId, membershipId);

    res.status(204).send();
  },
});

export interface ProjectInvitationsController {
  readonly handleListMine: RequestHandler;
  readonly handleAccept: RequestHandler;
  readonly handleDecline: RequestHandler;
}

export const createProjectInvitationsController = (
  service: ProjectInvitationsService,
): ProjectInvitationsController => ({
  handleListMine: async (req: Request, res: Response) => {
    res.json({ invitations: await service.listMine(getAuthenticatedUserId(res)) });
  },

  handleAccept: async (req: Request, res: Response) => {
    const { membershipId } = getValidated<{ membershipId: string }>(res, 'params');
    await service.accept(getAuthenticatedUserId(res), membershipId);

    res.status(204).send();
  },

  handleDecline: async (req: Request, res: Response) => {
    const { membershipId } = getValidated<{ membershipId: string }>(res, 'params');
    await service.decline(getAuthenticatedUserId(res), membershipId);

    res.status(204).send();
  },
});
