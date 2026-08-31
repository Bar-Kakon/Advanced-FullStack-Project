import Joi from 'joi';
import { Router, type RequestHandler } from 'express';

import { getValidated, validateRequest } from '../../middleware/validateRequest.js';
import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { companyRepository } from '../companies/company.repository.js';
import { companyMembershipRepository } from '../companies/companyMembership.repository.js';
import { createCompanyContextService } from '../companies/companyContext.service.js';
import { projectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import { projectRepository } from '../projects/project.repository.js';
import { muteConversationReader } from './muteConversation.adapter.js';
import { muteRepository } from './mute.repository.js';
import { createMuteService, type MuteService } from './mute.service.js';

const projectParamsSchema = Joi.object({ projectId: Joi.string().hex().length(24).required() });
const conversationParamsSchema = Joi.object({
  conversationId: Joi.string().hex().length(24).required(),
});
const contractorParamsSchema = Joi.object({ userId: Joi.string().hex().length(24).required() });
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
    conversations: muteConversationReader,
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

  /**
   * Conversation and contractor mute. Both are the caller's OWN delivery preference: neither
   * changes access, authority or domain state, and neither is a block.
   */
  router.get(
    '/conversations/:conversationId',
    validateRequest({ params: conversationParamsSchema }),
    async (req, res) => {
      const { conversationId } = getValidated<{ conversationId: string }>(res, 'params');
      res.json({ mute: await service.conversationMute(getAuthenticatedUserId(res), conversationId) });
    },
  );

  router.put(
    '/conversations/:conversationId',
    validateRequest({ params: conversationParamsSchema, body: muteBodySchema }),
    async (req, res) => {
      const { conversationId } = getValidated<{ conversationId: string }>(res, 'params');
      const { muted } = getValidated<{ muted: boolean }>(res, 'body');
      res.json({
        mute: await service.setConversationMute(getAuthenticatedUserId(res), conversationId, muted),
      });
    },
  );

  router.get(
    '/contractors/:userId',
    validateRequest({ params: contractorParamsSchema }),
    async (req, res) => {
      const { userId } = getValidated<{ userId: string }>(res, 'params');
      res.json({ mute: await service.contractorMute(getAuthenticatedUserId(res), userId) });
    },
  );

  router.put(
    '/contractors/:userId',
    validateRequest({ params: contractorParamsSchema, body: muteBodySchema }),
    async (req, res) => {
      const { userId } = getValidated<{ userId: string }>(res, 'params');
      const { muted } = getValidated<{ muted: boolean }>(res, 'body');
      res.json({ mute: await service.setContractorMute(getAuthenticatedUserId(res), userId, muted) });
    },
  );

  return router;
};
