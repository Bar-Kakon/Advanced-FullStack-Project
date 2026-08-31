import { Router, type RequestHandler } from 'express';

import { validateRequest } from '../../middleware/validateRequest.js';
import { companyRepository } from '../companies/company.repository.js';
import { companyMembershipRepository } from '../companies/companyMembership.repository.js';
import { createCompanyContextService } from '../companies/companyContext.service.js';
import { createProjectsController } from './projects.controller.js';
import { projectRepository } from './project.repository.js';
import { companyCalendarRepository } from '../calendar/companyCalendar.repository.js';
import { projectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import { projectGrantRepository } from '../projectaccess/projectGrant.repository.js';
import { createProjectsService } from './projects.service.js';
import { taskExecutionAdapter } from '../tasks/taskExecution.adapter.js';
import { buildCoordinationService } from '../coordination/coordination.module.js';
import {
  adoptCalendarBodySchema,
  calendarOverridesSchema,
  createProjectBodySchema,
  projectListQuerySchema,
  projectParamsSchema,
  updateProjectBodySchema,
} from './projects.validation.js';

export const createProjectsModule = (requireAccessToken: RequestHandler): Router => {
  const coordination = buildCoordinationService();

  const controller = createProjectsController(
    createProjectsService({
      projects: projectRepository,
      companyContext: createCompanyContextService({
        memberships: companyMembershipRepository,
        companies: companyRepository,
      }),
      execution: taskExecutionAdapter,
      calendars: companyCalendarRepository,
      access: projectAccessRepository,
      grants: projectGrantRepository,
      pendingActions: { forUser: (userId) => coordination.pendingActionsFor(userId) },
    }),
  );

  const router = Router();
  router.use(requireAccessToken);

  const params = validateRequest({ params: projectParamsSchema });

  router.post('/', validateRequest({ body: createProjectBodySchema }), controller.handleCreate);
  router.get('/', validateRequest({ query: projectListQuerySchema }), controller.handleList);
  router.get('/calendar/outdated', controller.handleOutdatedCalendarCount);
  router.get('/:projectId', params, controller.handleGetOne);
  router.patch(
    '/:projectId',
    validateRequest({ params: projectParamsSchema, body: updateProjectBodySchema }),
    controller.handleUpdate,
  );
  router.post(
    '/:projectId/calendar/adopt',
    validateRequest({ params: projectParamsSchema, body: adoptCalendarBodySchema }),
    controller.handleAdoptCalendar,
  );
  router.put(
    '/:projectId/calendar/overrides',
    validateRequest({ params: projectParamsSchema, body: calendarOverridesSchema }),
    controller.handleSetCalendarOverrides,
  );
  router.delete('/:projectId', params, controller.handleCancel);

  return router;
};
