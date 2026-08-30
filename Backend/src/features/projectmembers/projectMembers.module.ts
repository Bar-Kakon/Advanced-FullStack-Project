import { Router, type RequestHandler } from 'express';

import { validateRequest } from '../../middleware/validateRequest.js';
import type { BlocksService } from '../blocks/blocks.service.js';
import { companyRepository } from '../companies/company.repository.js';
import { companyMembershipRepository } from '../companies/companyMembership.repository.js';
import { createCompanyContextService } from '../companies/companyContext.service.js';
import { permissionTemplateRepository } from '../projectaccess/permissionTemplate.repository.js';
import { projectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import { projectGrantRepository } from '../projectaccess/projectGrant.repository.js';
import { projectRepository } from '../projects/project.repository.js';
import { participantRepository } from './participant.repository.js';
import { createProjectInvitationsService } from './projectInvitations.service.js';
import {
  createProjectInvitationsController,
  createProjectMembersController,
} from './projectMembers.controller.js';
import { createProjectMembersService } from './projectMembers.service.js';
import {
  invitationParamsSchema,
  inviteBodySchema,
  memberRoleBodySchema,
  membershipParamsSchema,
  projectScopeParamsSchema,
} from './projectMembers.validation.js';

/**
 * The people on ONE project, over the same `projectMembership` rows the Permissions surface calls
 * grants. Nothing here stores a second membership and nothing here stores a second permission —
 * authority changes go to `/api/permissions/grants`, and this module only ever moves a row's
 * status and its descriptive role.
 */
export const createProjectMembersModule = (
  requireAccessToken: RequestHandler,
  blocks: BlocksService,
): Router => {
  const controller = createProjectMembersController(
    createProjectMembersService({
      projects: projectRepository,
      companyContext: createCompanyContextService({
        memberships: companyMembershipRepository,
        companies: companyRepository,
      }),
      access: projectAccessRepository,
      grants: projectGrantRepository,
      templates: permissionTemplateRepository,
      participants: participantRepository,
      blocks,
    }),
  );

  // The project id lives on the parent mount, so this router has to be told to keep it.
  const router = Router({ mergeParams: true });
  router.use(requireAccessToken);

  router.get('/', validateRequest({ params: projectScopeParamsSchema }), controller.handleList);
  router.post(
    '/',
    validateRequest({ params: projectScopeParamsSchema, body: inviteBodySchema }),
    controller.handleInvite,
  );
  router.patch(
    '/:membershipId',
    validateRequest({ params: membershipParamsSchema, body: memberRoleBodySchema }),
    controller.handleSetRole,
  );
  router.delete(
    '/:membershipId',
    validateRequest({ params: membershipParamsSchema }),
    controller.handleRemove,
  );

  return router;
};

/** The other side of the same rows: what an invited person sees, and how they answer. */
export const createProjectInvitationsModule = (requireAccessToken: RequestHandler): Router => {
  const controller = createProjectInvitationsController(
    createProjectInvitationsService({
      projects: projectRepository,
      access: projectAccessRepository,
      grants: projectGrantRepository,
      participants: participantRepository,
    }),
  );

  const router = Router();
  router.use(requireAccessToken);

  const params = validateRequest({ params: invitationParamsSchema });

  router.get('/', controller.handleListMine);
  router.post('/:membershipId/accept', params, controller.handleAccept);
  router.post('/:membershipId/decline', params, controller.handleDecline);

  return router;
};
