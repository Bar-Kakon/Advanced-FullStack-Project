import { Router, type RequestHandler } from 'express';

import { getValidated, validateRequest } from '../../middleware/validateRequest.js';
import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { companyCalendarRepository } from '../calendar/companyCalendar.repository.js';
import { companyRepository } from '../companies/company.repository.js';
import { companyMembershipRepository } from '../companies/companyMembership.repository.js';
import { createCompanyContextService } from '../companies/companyContext.service.js';
import { participantRepository } from '../projectmembers/participant.repository.js';
import { projectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import { projectRepository } from '../projects/project.repository.js';
import { taskExecutionAdapter } from '../tasks/taskExecution.adapter.js';
import { projectScopeParamsSchema } from '../projectmembers/projectMembers.validation.js';
import { createProjectDashboardService } from './projectDashboard.service.js';

/**
 * One read that assembles the working context of a single project. Every write it leads to belongs
 * to the feature that owns it — Projects for edit and cancel, Permissions for grants, Members for
 * people, Calendar for adoption — so there is no second write path to any of them.
 */
export const createProjectDashboardModule = (requireAccessToken: RequestHandler): Router => {
  const service = createProjectDashboardService({
    projects: projectRepository,
    companyContext: createCompanyContextService({
      memberships: companyMembershipRepository,
      companies: companyRepository,
    }),
    access: projectAccessRepository,
    calendars: companyCalendarRepository,
    participants: participantRepository,
    execution: taskExecutionAdapter,
  });

  const router = Router({ mergeParams: true });
  router.use(requireAccessToken);

  router.get('/', validateRequest({ params: projectScopeParamsSchema }), async (req, res) => {
    const { projectId } = getValidated<{ projectId: string }>(res, 'params');
    res.json(await service.get(getAuthenticatedUserId(res), projectId));
  });

  return router;
};
