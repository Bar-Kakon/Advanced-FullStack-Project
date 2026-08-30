import { Types } from 'mongoose';
import { Router, type RequestHandler } from 'express';

import { getValidated, validateRequest } from '../../middleware/validateRequest.js';
import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { companyRepository } from '../companies/company.repository.js';
import { companyMembershipRepository } from '../companies/companyMembership.repository.js';
import { createCompanyContextService } from '../companies/companyContext.service.js';
import { projectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import { projectRepository } from '../projects/project.repository.js';
import { projectNotFound } from '../projects/project.errors.js';
import {
  requireActiveCompany,
  requireProjectPermission,
  resolveProjectAccess,
} from '../projects/projectAuthorization.js';
import { projectScopeParamsSchema } from '../projectmembers/projectMembers.validation.js';
import { createStagesService } from './stages.service.js';
import { createStageBodySchema, stageDependenciesBodySchema } from './tasks.validation.js';
import Joi from 'joi';

const stageParamsSchema = projectScopeParamsSchema.keys({
  stageId: Joi.string().trim().required(),
});

/**
 * The stages of one project, and the edges between them.
 *
 * Owner decision (2026-08-30): dependencies run between stages, never between individual tasks.
 * Only somebody with project-edit authority may change the order, because the stages of a project
 * are the GC's to set.
 */
export const createStagesModule = (requireAccessToken: RequestHandler): Router => {
  const stages = createStagesService();
  const companyContext = createCompanyContextService({
    memberships: companyMembershipRepository,
    companies: companyRepository,
  });

  const reachProject = async (userId: string, projectId: string) => {
    const authority = requireActiveCompany(await companyContext.forUser(userId), userId);
    const memberOf = await projectAccessRepository.listActiveProjectIdsForUser(new Types.ObjectId(userId));
    const project = await projectRepository.findAccessibleById(
      projectId,
      new Types.ObjectId(authority.companyId),
      memberOf,
    );
    if (project === null) throw projectNotFound();

    const resolved = await resolveProjectAccess({
      projectId: project._id,
      projectCompany: project.company,
      userId: new Types.ObjectId(userId),
      authority,
      access: projectAccessRepository,
    });
    return { project, resolved };
  };

  const router = Router({ mergeParams: true });
  router.use(requireAccessToken);

  router.get('/', validateRequest({ params: projectScopeParamsSchema }), async (req, res) => {
    const { projectId } = getValidated<{ projectId: string }>(res, 'params');
    const { project } = await reachProject(getAuthenticatedUserId(res), projectId);
    res.json({ stages: await stages.list(project._id) });
  });

  // A project task must name a stage, so a fresh project needs a way to have one.
  router.post(
    '/',
    validateRequest({ params: projectScopeParamsSchema, body: createStageBodySchema }),
    async (req, res) => {
      const { projectId } = getValidated<{ projectId: string }>(res, 'params');
      const body = getValidated<{ name: string; isGate: boolean; order?: number }>(res, 'body');

      const { project, resolved } = await reachProject(getAuthenticatedUserId(res), projectId);
      requireProjectPermission(resolved, 'project.edit');

      res.status(201).json({ stage: await stages.create(project._id, body) });
    },
  );

  router.patch(
    '/:stageId/dependencies',
    validateRequest({ params: stageParamsSchema, body: stageDependenciesBodySchema }),
    async (req, res) => {
      const { projectId, stageId } = getValidated<{ projectId: string; stageId: string }>(res, 'params');
      const { dependsOn } = getValidated<{ dependsOn: string[] }>(res, 'body');

      const { project, resolved } = await reachProject(getAuthenticatedUserId(res), projectId);
      requireProjectPermission(resolved, 'project.edit');

      res.json({ stage: await stages.setDependencies(project._id, stageId, dependsOn) });
    },
  );

  return router;
};
