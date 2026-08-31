import type { Request, RequestHandler, Response } from 'express';

import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { getValidated } from '../../middleware/validateRequest.js';
import type { ProjectsService } from './projects.service.js';
import type {
  CreateProjectBody,
  ProjectListQuery,
  ProjectParams,
  UpdateProjectBody,
} from './projects.validation.js';

export interface ProjectsController {
  readonly handleCreate: RequestHandler;
  readonly handleList: RequestHandler;
  readonly handleGetOne: RequestHandler;
  readonly handleUpdate: RequestHandler;
  readonly handleCancel: RequestHandler;
  readonly handleAdoptCalendar: RequestHandler;
  readonly handleSetCalendarOverrides: RequestHandler;
  readonly handleOutdatedCalendarCount: RequestHandler;
}

export const createProjectsController = (service: ProjectsService): ProjectsController => ({
  handleCreate: async (req: Request, res: Response) => {
    const body = getValidated<CreateProjectBody>(res, 'body');
    const project = await service.create(getAuthenticatedUserId(res), body);

    res.status(201).json({ project });
  },

  handleList: async (req: Request, res: Response) => {
    const query = getValidated<ProjectListQuery>(res, 'query');
    const page = await service.list(getAuthenticatedUserId(res), query.limit, query.cursor);

    res.json(page);
  },

  handleGetOne: async (req: Request, res: Response) => {
    const { projectId } = getValidated<ProjectParams>(res, 'params');
    const project = await service.getOne(getAuthenticatedUserId(res), projectId);

    res.json({ project });
  },

  handleUpdate: async (req: Request, res: Response) => {
    const { projectId } = getValidated<ProjectParams>(res, 'params');
    const body = getValidated<UpdateProjectBody>(res, 'body');
    const project = await service.update(getAuthenticatedUserId(res), projectId, body);

    res.json({ project });
  },

  handleAdoptCalendar: async (req: Request, res: Response) => {
    const { projectId } = getValidated<ProjectParams>(res, 'params');
    const { keepOverrides } = getValidated<{ keepOverrides: boolean }>(res, 'body');
    const project = await service.adoptCurrentCalendar(getAuthenticatedUserId(res), projectId, keepOverrides);

    res.json({ project });
  },

  handleSetCalendarOverrides: async (req: Request, res: Response) => {
    const { projectId } = getValidated<ProjectParams>(res, 'params');
    const overrides = getValidated<unknown>(res, 'body');
    const project = await service.setCalendarOverrides(getAuthenticatedUserId(res), projectId, overrides);

    res.json({ project });
  },

  handleOutdatedCalendarCount: async (req: Request, res: Response) => {
    const outdated = await service.outdatedCalendarCount(getAuthenticatedUserId(res));

    res.json({ outdated });
  },

  handleCancel: async (req: Request, res: Response) => {
    const { projectId } = getValidated<ProjectParams>(res, 'params');
    await service.cancel(getAuthenticatedUserId(res), projectId);

    res.status(204).send();
  },
});
