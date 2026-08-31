import Joi from 'joi';
import { Router, type RequestHandler } from 'express';

import { getValidated, validateRequest } from '../../middleware/validateRequest.js';
import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { companyCalendarRepository } from '../calendar/companyCalendar.repository.js';
import { companyRepository } from '../companies/company.repository.js';
import { companyMembershipRepository } from '../companies/companyMembership.repository.js';
import { createCompanyContextService } from '../companies/companyContext.service.js';
import { buildNotificationDispatchService } from '../notifications/notifications.module.js';
import { projectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import { participantRepository } from '../projectmembers/participant.repository.js';
import { projectRepository } from '../projects/project.repository.js';
import { parseCalendarDate } from '../projects/projectDates.js';
import { invalidWindow } from './scheduleException.errors.js';
import { EXCEPTION_KINDS, EXCEPTION_SCOPES } from './scheduleException.model.js';
import { scheduleExceptionRepository } from './scheduleException.repository.js';
import {
  createScheduleExceptionService,
  type ScheduleExceptionService,
} from './scheduleException.service.js';

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const calendarDate = Joi.string().trim().pattern(CALENDAR_DATE);

/** A date the pattern accepted but the calendar rejects — 2027-02-31 — is refused, not coerced. */
const requireDate = (value: string): Date => {
  const parsed = parseCalendarDate(value);
  if (parsed === null) throw invalidWindow();
  return parsed;
};

const projectParamsSchema = Joi.object({ projectId: Joi.string().hex().length(24).required() });
const exceptionParamsSchema = Joi.object({ exceptionId: Joi.string().hex().length(24).required() });

/**
 * `professionalId` is deliberately absent from every schema below. A professional requests for
 * themself and never for another, so the subject is taken from the Access Token rather than
 * offered as a field somebody could fill in with somebody else's id.
 */
const requestBodySchema = Joi.object({
  kind: Joi.string()
    .valid(...EXCEPTION_KINDS)
    .required(),
  scope: Joi.string()
    .valid(...EXCEPTION_SCOPES)
    .required(),
  taskId: Joi.when('scope', {
    is: 'task',
    then: Joi.string().hex().length(24).required(),
    otherwise: Joi.forbidden(),
  }),
  fromDate: calendarDate.required(),
  toDate: calendarDate.required(),
  reason: Joi.string().trim().max(600).optional(),
});

const modifyBodySchema = Joi.object({
  kind: Joi.string().valid(...EXCEPTION_KINDS),
  fromDate: calendarDate,
  toDate: calendarDate,
  note: Joi.string().trim().max(600),
}).min(1);

const decideBodySchema = Joi.object({
  approve: Joi.boolean().required(),
  note: Joi.string().trim().max(600).optional(),
});

export const buildScheduleExceptionService = (): ScheduleExceptionService =>
  createScheduleExceptionService({
    exceptions: scheduleExceptionRepository,
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

export const createScheduleExceptionsModule = (
  requireAccessToken: RequestHandler,
  service: ScheduleExceptionService = buildScheduleExceptionService(),
): Router => {
  const router = Router();
  router.use(requireAccessToken);

  router.get(
    '/projects/:projectId',
    validateRequest({ params: projectParamsSchema }),
    async (req, res) => {
      const { projectId } = getValidated<{ projectId: string }>(res, 'params');
      res.json(await service.list(getAuthenticatedUserId(res), projectId));
    },
  );

  router.post(
    '/projects/:projectId',
    validateRequest({ params: projectParamsSchema, body: requestBodySchema }),
    async (req, res) => {
      const { projectId } = getValidated<{ projectId: string }>(res, 'params');
      const body = getValidated<{
        kind: 'non_working' | 'working';
        scope: 'project' | 'task' | 'professional';
        taskId?: string;
        fromDate: string;
        toDate: string;
        reason?: string;
      }>(res, 'body');

      const exception = await service.request(getAuthenticatedUserId(res), projectId, {
        kind: body.kind,
        scope: body.scope,
        ...(body.taskId === undefined ? {} : { taskId: body.taskId }),
        fromDate: requireDate(body.fromDate),
        toDate: requireDate(body.toDate),
        ...(body.reason === undefined ? {} : { reason: body.reason }),
      });
      res.status(201).json({ exception });
    },
  );

  router.patch(
    '/:exceptionId',
    validateRequest({ params: exceptionParamsSchema, body: modifyBodySchema }),
    async (req, res) => {
      const { exceptionId } = getValidated<{ exceptionId: string }>(res, 'params');
      const body = getValidated<{
        kind?: 'non_working' | 'working';
        fromDate?: string;
        toDate?: string;
        note?: string;
      }>(res, 'body');

      const exception = await service.modify(getAuthenticatedUserId(res), exceptionId, {
        ...(body.kind === undefined ? {} : { kind: body.kind }),
        ...(body.fromDate === undefined ? {} : { fromDate: requireDate(body.fromDate) }),
        ...(body.toDate === undefined ? {} : { toDate: requireDate(body.toDate) }),
        ...(body.note === undefined ? {} : { note: body.note }),
      });
      res.json({ exception });
    },
  );

  router.post(
    '/:exceptionId/decision',
    validateRequest({ params: exceptionParamsSchema, body: decideBodySchema }),
    async (req, res) => {
      const { exceptionId } = getValidated<{ exceptionId: string }>(res, 'params');
      const { approve, note } = getValidated<{ approve: boolean; note?: string }>(res, 'body');

      res.json({
        exception: await service.decide(getAuthenticatedUserId(res), exceptionId, approve, note),
      });
    },
  );

  router.post(
    '/:exceptionId/cancel',
    validateRequest({ params: exceptionParamsSchema }),
    async (req, res) => {
      const { exceptionId } = getValidated<{ exceptionId: string }>(res, 'params');
      res.json({ exception: await service.cancel(getAuthenticatedUserId(res), exceptionId) });
    },
  );

  return router;
};
