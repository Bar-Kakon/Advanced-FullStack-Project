import { Router, type RequestHandler } from 'express';

import { getValidated, validateRequest } from '../../middleware/validateRequest.js';
import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { participantRepository } from '../projectmembers/participant.repository.js';
import { projectRepository } from '../projects/project.repository.js';
import { createMyTasksService, type MyTasksFilters } from './myTasks.service.js';
import { unbuiltProposalMarkerPort } from './proposals.port.js';
import { taskRepository } from './task.repository.js';
import { myTasksQuerySchema, taskParamsSchema } from './tasks.validation.js';

/**
 * My Tasks: one person's queue, whether the work came from a project or they opened it themselves.
 *
 * Everything privacy-sensitive is decided in the viewer-aware layer this service calls, so the
 * routes stay thin and the delegation wall has exactly one implementation.
 */
export const createTasksModule = (requireAccessToken: RequestHandler): Router => {
  const service = createMyTasksService({
    tasks: taskRepository,
    projects: projectRepository,
    participants: participantRepository,
    proposals: unbuiltProposalMarkerPort,
  });

  const router = Router();
  router.use(requireAccessToken);

  const params = validateRequest({ params: taskParamsSchema });

  router.get('/', validateRequest({ query: myTasksQuerySchema }), async (req, res) => {
    const filters = getValidated<MyTasksFilters>(res, 'query');
    res.json(await service.list(getAuthenticatedUserId(res), filters));
  });

  router.post('/:taskId/start', params, async (req, res) => {
    const { taskId } = getValidated<{ taskId: string }>(res, 'params');
    res.json({ task: await service.start(getAuthenticatedUserId(res), taskId) });
  });

  router.post('/:taskId/complete', params, async (req, res) => {
    const { taskId } = getValidated<{ taskId: string }>(res, 'params');
    res.json({ task: await service.complete(getAuthenticatedUserId(res), taskId) });
  });

  return router;
};
