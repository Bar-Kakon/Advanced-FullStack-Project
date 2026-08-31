import Joi from 'joi';
import { Router, type RequestHandler } from 'express';

import { getValidated, validateRequest } from '../../middleware/validateRequest.js';
import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { companyRepository } from '../companies/company.repository.js';
import { companyMembershipRepository } from '../companies/companyMembership.repository.js';
import { createCompanyContextService } from '../companies/companyContext.service.js';
import { projectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import { projectRepository } from '../projects/project.repository.js';
import { muteRepository } from './mute.repository.js';
import { createMuteService, type MuteService } from './mute.service.js';

const projectParamsSchema = Joi.object({ projectId: Joi.string().hex().length(24).required() });
const muteBodySchema = Joi.object({ muted: Joi.boolean().required() });

export const buildMuteService = (): MuteService =>
  createMuteService({
    mutes: muteRepository,
    projects: projectRepository,
    access: projectAccessRepository,
    companyContext: createCompanyContextService({
      memberships: companyMembershipRepository,
      companies: companyRepository,
    }),
  });

export const createMutesModule = (
  requireAccessToken: RequestHandler,
  service: MuteService = buildMuteService(),
): Router => {
  const router = Router();
  router.use(requireAccessToken);

  router.get('/projects/:projectId', validateRequest({ params: projectParamsSchema }), async (req, res) => {
    const { projectId } = getValidated<{ projectId: string }>(res, 'params');
    res.json({ mute: await service.projectMute(getAuthenticatedUserId(res), projectId) });
  });

  router.put(
    '/projects/:projectId',
    validateRequest({ params: projectParamsSchema, body: muteBodySchema }),
    async (req, res) => {
      const { projectId } = getValidated<{ projectId: string }>(res, 'params');
      const { muted } = getValidated<{ muted: boolean }>(res, 'body');
      res.json({ mute: await service.setProjectMute(getAuthenticatedUserId(res), projectId, muted) });
    },
  );

  return router;
};
