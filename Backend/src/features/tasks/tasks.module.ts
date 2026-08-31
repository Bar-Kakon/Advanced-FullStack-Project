import { Router, type RequestHandler } from 'express';

import { getValidated, validateRequest } from '../../middleware/validateRequest.js';
import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { companyCalendarRepository } from '../calendar/companyCalendar.repository.js';
import { companyRepository } from '../companies/company.repository.js';
import { companyMembershipRepository } from '../companies/companyMembership.repository.js';
import { createCompanyContextService } from '../companies/companyContext.service.js';
import { createContractorEligibilityService } from '../companies/contractorEligibility.js';
import { participantRepository } from '../projectmembers/participant.repository.js';
import { projectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import { projectRepository } from '../projects/project.repository.js';
import { parseCalendarDate } from '../projects/projectDates.js';
import { createMyTasksService, type MyTasksFilters } from './myTasks.service.js';
import { createTaskCreationService, type CreateTaskInput } from './taskCreation.service.js';
import { invalidCalendarDate } from './taskCreation.errors.js';
import {
  buildCoordinationService,
  toRequestedChanges,
  type DateChangeBody,
} from '../coordination/coordination.module.js';
import { dateChangeBodySchema } from '../coordination/coordination.validation.js';
import {
  createProposalMarkerAdapter,
  createReschedulePortAdapter,
} from '../coordination/taskCoordination.adapter.js';
import { buildNotificationDispatchService } from '../notifications/notifications.module.js';
import { taskRepository } from './task.repository.js';
import { createTaskDetailService } from './taskDetail.service.js';
import { createTaskEditService, type EditTaskInput } from './taskEdit.service.js';
import type { DelegationScope } from './task.model.js';
import type { PrivateItemKind } from './privateWork.model.js';
import {
  createTaskBodySchema,
  delegateBodySchema,
  editTaskBodySchema,
  myTasksQuerySchema,
  privateItemBodySchema,
  privateItemParamsSchema,
  privateToggleBodySchema,
  projectOptionsParamsSchema,
  taskParamsSchema,
} from './tasks.validation.js';

const requireDate = (value: string): Date => {
  const parsed = parseCalendarDate(value);
  if (parsed === null) throw invalidCalendarDate();
  return parsed;
};

/** The body carries dates as `YYYY-MM-DD`; the service works in UTC-midnight Dates only. */
interface CreateTaskBody {
  readonly kind: 'project' | 'standalone';
  readonly title: string;
  readonly description?: string;
  readonly startDate: string;
  readonly dueDate: string;
  readonly projectId?: string;
  readonly stageId?: string;
  readonly assigneeId?: string;
  readonly ownCrewOnly?: boolean;
  readonly delegatorOnSiteRequired?: boolean;
}

/**
 * The Tasks surface: one person's queue, and the detail of a single piece of work.
 *
 * Both read through the same viewer-aware layer, so the delegation wall has one implementation and
 * no route can forget it.
 */
export const createTasksModule = (requireAccessToken: RequestHandler): Router => {
  const coordination = buildCoordinationService();

  const contractorEligibility = createContractorEligibilityService({
    companies: companyRepository,
    memberships: companyMembershipRepository,
  });

  const myTasks = createMyTasksService({
    tasks: taskRepository,
    projects: projectRepository,
    participants: participantRepository,
    proposals: createProposalMarkerAdapter(coordination),
  });

  const detail = createTaskDetailService({
    tasks: taskRepository,
    projects: projectRepository,
    access: projectAccessRepository,
    participants: participantRepository,
    reschedule: createReschedulePortAdapter(coordination),
    eligibility: contractorEligibility,
  });

  const creation = createTaskCreationService({
    tasks: taskRepository,
    projects: projectRepository,
    access: projectAccessRepository,
    participants: participantRepository,
    calendars: companyCalendarRepository,
    companyContext: createCompanyContextService({
      memberships: companyMembershipRepository,
      companies: companyRepository,
    }),
    notifications: buildNotificationDispatchService(),
  });

  const edit = createTaskEditService({
    projects: projectRepository,
    access: projectAccessRepository,
    companyContext: createCompanyContextService({
      memberships: companyMembershipRepository,
      companies: companyRepository,
    }),
    notifications: buildNotificationDispatchService(),
  });

  const router = Router();
  router.use(requireAccessToken);

  const params = validateRequest({ params: taskParamsSchema });
  const itemParams = validateRequest({ params: privateItemParamsSchema });
  const me = getAuthenticatedUserId;

  router.get('/', validateRequest({ query: myTasksQuerySchema }), async (req, res) => {
    res.json(await myTasks.list(me(res), getValidated<MyTasksFilters>(res, 'query')));
  });

  // Registered ahead of `/:taskId`, or the literal path would be read as an id.
  router.get('/create-options', async (req, res) => {
    res.json(await creation.options(me(res)));
  });

  router.get(
    '/create-options/:projectId',
    validateRequest({ params: projectOptionsParamsSchema }),
    async (req, res) => {
      const { projectId } = getValidated<{ projectId: string }>(res, 'params');
      res.json(await creation.projectOptions(me(res), projectId));
    },
  );

  router.post('/', validateRequest({ body: createTaskBodySchema }), async (req, res) => {
    const body = getValidated<CreateTaskBody>(res, 'body');
    const startDate = requireDate(body.startDate);
    const dueDate = requireDate(body.dueDate);

    const input: CreateTaskInput =
      body.kind === 'project'
        ? {
            kind: 'project',
            projectId: body.projectId as string,
            stageId: body.stageId as string,
            title: body.title,
            ...(body.description === undefined ? {} : { description: body.description }),
            assigneeId: body.assigneeId as string,
            startDate,
            dueDate,
            ownCrewOnly: body.ownCrewOnly ?? false,
            delegatorOnSiteRequired: body.delegatorOnSiteRequired ?? false,
          }
        : {
            kind: 'standalone',
            title: body.title,
            ...(body.description === undefined ? {} : { description: body.description }),
            startDate,
            dueDate,
          };

    res.status(201).json(await creation.create(me(res), input));
  });

  router.post('/:taskId/start', params, async (req, res) => {
    const { taskId } = getValidated<{ taskId: string }>(res, 'params');
    res.json({ task: await myTasks.start(me(res), taskId) });
  });

  router.post('/:taskId/complete', params, async (req, res) => {
    const { taskId } = getValidated<{ taskId: string }>(res, 'params');
    const task = await myTasks.complete(me(res), taskId);
    await coordination.recordEarlyCompletion(taskId);
    res.json({ task });
  });

  router.get('/:taskId', params, async (req, res) => {
    const { taskId } = getValidated<{ taskId: string }>(res, 'params');
    res.json({ task: await detail.get(me(res), taskId) });
  });

  // Answered before the form is drawn, so no control is offered that the PATCH would refuse.
  router.get('/:taskId/editable', params, async (req, res) => {
    const { taskId } = getValidated<{ taskId: string }>(res, 'params');
    res.json({ editable: await edit.editableFields(me(res), taskId) });
  });

  router.patch(
    '/:taskId',
    validateRequest({ params: taskParamsSchema, body: editTaskBodySchema }),
    async (req, res) => {
      const { taskId } = getValidated<{ taskId: string }>(res, 'params');
      const body = getValidated<{
        title?: string;
        description?: string | null;
        ownCrewOnly?: boolean;
        delegatorOnSiteRequired?: boolean;
        stageId?: string;
        startDate?: string;
        dueDate?: string;
      }>(res, 'body');

      const input: EditTaskInput = {
        ...(body.title === undefined ? {} : { title: body.title }),
        ...(body.description === undefined ? {} : { description: body.description }),
        ...(body.ownCrewOnly === undefined ? {} : { ownCrewOnly: body.ownCrewOnly }),
        ...(body.delegatorOnSiteRequired === undefined
          ? {}
          : { delegatorOnSiteRequired: body.delegatorOnSiteRequired }),
        ...(body.stageId === undefined ? {} : { stageId: body.stageId }),
        ...(body.startDate === undefined ? {} : { startDate: requireDate(body.startDate) }),
        ...(body.dueDate === undefined ? {} : { dueDate: requireDate(body.dueDate) }),
      };

      res.json({ task: await edit.edit(me(res), taskId, input) });
    },
  );

  router.post(
    '/:taskId/delegation',
    validateRequest({ params: taskParamsSchema, body: delegateBodySchema }),
    async (req, res) => {
      const { taskId } = getValidated<{ taskId: string }>(res, 'params');
      const body = getValidated<{ userId: string; scope: DelegationScope; partDescription?: string }>(res, 'body');
      res.status(201).json({ task: await detail.delegate(me(res), taskId, body) });
    },
  );

  router.delete('/:taskId/delegation', params, async (req, res) => {
    const { taskId } = getValidated<{ taskId: string }>(res, 'params');
    res.json({ task: await detail.endDelegation(me(res), taskId) });
  });

  router.get('/:taskId/private', params, async (req, res) => {
    const { taskId } = getValidated<{ taskId: string }>(res, 'params');
    res.json({ items: await detail.listPrivate(me(res), taskId) });
  });

  router.post(
    '/:taskId/private',
    validateRequest({ params: taskParamsSchema, body: privateItemBodySchema }),
    async (req, res) => {
      const { taskId } = getValidated<{ taskId: string }>(res, 'params');
      const { kind, body } = getValidated<{ kind: PrivateItemKind; body: string }>(res, 'body');
      res.status(201).json({ item: await detail.addPrivate(me(res), taskId, kind, body) });
    },
  );

  router.patch(
    '/:taskId/private/:itemId',
    validateRequest({ params: privateItemParamsSchema, body: privateToggleBodySchema }),
    async (req, res) => {
      const { taskId, itemId } = getValidated<{ taskId: string; itemId: string }>(res, 'params');
      const { done } = getValidated<{ done: boolean }>(res, 'body');
      res.json({ item: await detail.togglePrivate(me(res), taskId, itemId, done) });
    },
  );

  router.delete('/:taskId/private/:itemId', itemParams, async (req, res) => {
    const { taskId, itemId } = getValidated<{ taskId: string; itemId: string }>(res, 'params');
    await detail.removePrivate(me(res), taskId, itemId);
    res.status(204).send();
  });

  router.post(
    '/:taskId/date-change',
    validateRequest({ params: taskParamsSchema, body: dateChangeBodySchema }),
    async (req, res) => {
      const { taskId } = getValidated<{ taskId: string }>(res, 'params');
      const body = getValidated<DateChangeBody>(res, 'body');
      res.status(201).json({
        proposal: await coordination.request(me(res), taskId, {
          changes: toRequestedChanges(body),
          ...(body.reason === undefined ? {} : { reason: body.reason }),
          ...(body.responseHours === undefined ? {} : { responseHours: body.responseHours }),
        }),
      });
    },
  );

  router.post(
    '/:taskId/date-change/preview',
    validateRequest({ params: taskParamsSchema, body: dateChangeBodySchema }),
    async (req, res) => {
      const { taskId } = getValidated<{ taskId: string }>(res, 'params');
      const body = getValidated<DateChangeBody>(res, 'body');
      res.json({ preview: await coordination.preview(me(res), taskId, toRequestedChanges(body)) });
    },
  );

  return router;
};
