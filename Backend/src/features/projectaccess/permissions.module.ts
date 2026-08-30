import { Router, type RequestHandler } from 'express';

import { getValidated, validateRequest } from '../../middleware/validateRequest.js';
import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { companyRepository } from '../companies/company.repository.js';
import { companyMembershipRepository } from '../companies/companyMembership.repository.js';
import { createCompanyContextService } from '../companies/companyContext.service.js';
import { projectRepository } from '../projects/project.repository.js';
import { projectAccessRepository } from './projectAccess.repository.js';
import { projectGrantRepository } from './projectGrant.repository.js';
import { permissionTemplateRepository } from './permissionTemplate.repository.js';
import { createPermissionsService, type GrantInput } from './permissions.service.js';
import {
  grantBodySchema,
  grantParamsSchema,
  grantUpdateBodySchema,
  templateBodySchema,
  templateParamsSchema,
} from './permissions.validation.js';
import type { ProjectPermission } from './projectPermission.js';

/**
 * The central Permissions surface: one place to manage PROJECT-SCOPED grants across many projects.
 *
 * It is not a company-wide permission model. Every row it writes is a grant on one project, which
 * is the same row the per-project surface inside a Project Dashboard will read and write — one
 * model, two views. The only difference between the surfaces is the filter.
 */
export const createPermissionsModule = (requireAccessToken: RequestHandler): Router => {
  const service = createPermissionsService({
    companyContext: createCompanyContextService({
      memberships: companyMembershipRepository,
      companies: companyRepository,
    }),
    projects: projectRepository,
    access: projectAccessRepository,
    grants: projectGrantRepository,
    templates: permissionTemplateRepository,
  });

  const router = Router();
  router.use(requireAccessToken);

  router.get('/', async (req, res) => {
    res.json(await service.overview(getAuthenticatedUserId(res)));
  });

  router.post('/grants', validateRequest({ body: grantBodySchema }), async (req, res) => {
    const body = getValidated<GrantInput>(res, 'body');
    res.status(201).json({ grant: await service.grant(getAuthenticatedUserId(res), body) });
  });

  router.patch(
    '/grants/:grantId',
    validateRequest({ params: grantParamsSchema, body: grantUpdateBodySchema }),
    async (req, res) => {
      const { grantId } = getValidated<{ grantId: string }>(res, 'params');
      const body = getValidated<Parameters<typeof service.updateGrant>[2]>(res, 'body');
      res.json({ grant: await service.updateGrant(getAuthenticatedUserId(res), grantId, body) });
    },
  );

  router.delete('/grants/:grantId', validateRequest({ params: grantParamsSchema }), async (req, res) => {
    const { grantId } = getValidated<{ grantId: string }>(res, 'params');
    await service.revokeGrant(getAuthenticatedUserId(res), grantId);
    res.status(204).send();
  });

  router.get('/templates', async (req, res) => {
    res.json({ templates: await service.listTemplates(getAuthenticatedUserId(res)) });
  });

  router.post('/templates', validateRequest({ body: templateBodySchema }), async (req, res) => {
    const body = getValidated<{ name: string; permissions: ProjectPermission[]; fullAuthority: boolean }>(res, 'body');
    const template = await service.createTemplate(
      getAuthenticatedUserId(res),
      body.name,
      body.permissions,
      body.fullAuthority,
    );
    res.status(201).json({ template });
  });

  router.delete(
    '/templates/:templateId',
    validateRequest({ params: templateParamsSchema }),
    async (req, res) => {
      const { templateId } = getValidated<{ templateId: string }>(res, 'params');
      await service.deleteTemplate(getAuthenticatedUserId(res), templateId);
      res.status(204).send();
    },
  );

  return router;
};
