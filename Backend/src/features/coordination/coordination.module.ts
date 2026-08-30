import { Router, type RequestHandler } from 'express';

import { runInTransaction } from '../../db/mongoose.js';
import { getValidated, validateRequest } from '../../middleware/validateRequest.js';
import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { companyCalendarRepository } from '../calendar/companyCalendar.repository.js';
import { companyRepository } from '../companies/company.repository.js';
import { companyMembershipRepository } from '../companies/companyMembership.repository.js';
import { createCompanyContextService } from '../companies/companyContext.service.js';
import { projectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import { participantRepository } from '../projectmembers/participant.repository.js';
import { projectRepository } from '../projects/project.repository.js';
import { parseCalendarDate } from '../projects/projectDates.js';
import { auditRepository } from './audit.repository.js';
import { changeIsEmpty, counterNeedsDates } from './coordination.errors.js';
import { createCoordinationService, type CoordinationService } from './coordination.service.js';
import {
  excludeBodySchema,
  previewBodySchema,
  projectParamsSchema,
  proposalItemParamsSchema,
  proposalParamsSchema,
  releaseBodySchema,
  releaseParamsSchema,
  requestBodySchema,
  resolveBodySchema,
  respondBodySchema,
} from './coordination.validation.js';
import type { JustifiedDeclineReason, RequestedChanges } from './proposal.model.js';
import { proposalRepository } from './proposal.repository.js';
import type { ItemDecision } from './proposal.repository.js';

export interface DateChangeBody {
  readonly deltaWorkingDays?: number;
  readonly alternativeStart?: string;
  readonly alternativeDue?: string;
  readonly note?: string;
  readonly reason?: string;
  readonly responseHours?: number;
}

interface ChangesBody {
  readonly deltaWorkingDays?: number;
  readonly alternativeStart?: string;
  readonly alternativeDue?: string;
  readonly note?: string;
}

export const toRequestedChanges = (body: ChangesBody): RequestedChanges => {
  const start = body.alternativeStart === undefined ? null : parseCalendarDate(body.alternativeStart);
  const due = body.alternativeDue === undefined ? null : parseCalendarDate(body.alternativeDue);
  if (body.alternativeStart !== undefined && start === null) throw changeIsEmpty();
  if (body.alternativeDue !== undefined && due === null) throw changeIsEmpty();

  return {
    ...(body.deltaWorkingDays === undefined ? {} : { deltaWorkingDays: body.deltaWorkingDays }),
    ...(start === null ? {} : { alternativeStart: start }),
    ...(due === null ? {} : { alternativeDue: due }),
    ...(body.note === undefined ? {} : { note: body.note }),
  };
};

export const buildCoordinationService = (): CoordinationService =>
  createCoordinationService({
    proposals: proposalRepository,
    audit: auditRepository,
    projects: projectRepository,
    access: projectAccessRepository,
    calendars: companyCalendarRepository,
    participants: participantRepository,
    companyContext: createCompanyContextService({
      memberships: companyMembershipRepository,
      companies: companyRepository,
    }),
    transactions: { run: runInTransaction },
  });

export const createCoordinationModule = (
  requireAccessToken: RequestHandler,
  service: CoordinationService = buildCoordinationService(),
): Router => {
  const router = Router();
  router.use(requireAccessToken);

  router.post('/preview', validateRequest({ body: previewBodySchema }), async (req, res) => {
    const body = getValidated<{ taskId: string; changes: ChangesBody }>(res, 'body');
    res.json({
      preview: await service.preview(getAuthenticatedUserId(res), body.taskId, toRequestedChanges(body.changes)),
    });
  });

  router.post('/proposals', validateRequest({ body: requestBodySchema }), async (req, res) => {
    const body = getValidated<{
      taskId: string;
      changes: ChangesBody;
      reason?: string;
      responseHours?: number;
    }>(res, 'body');

    const proposal = await service.request(getAuthenticatedUserId(res), body.taskId, {
      changes: toRequestedChanges(body.changes),
      ...(body.reason === undefined ? {} : { reason: body.reason }),
      ...(body.responseHours === undefined ? {} : { responseHours: body.responseHours }),
    });
    res.status(201).json({ proposal });
  });

  router.get('/proposals/:proposalId', validateRequest({ params: proposalParamsSchema }), async (req, res) => {
    const { proposalId } = getValidated<{ proposalId: string }>(res, 'params');
    res.json({ proposal: await service.get(getAuthenticatedUserId(res), proposalId) });
  });

  router.post(
    '/proposals/:proposalId/launch',
    validateRequest({ params: proposalParamsSchema }),
    async (req, res) => {
      const { proposalId } = getValidated<{ proposalId: string }>(res, 'params');
      res.json({ proposal: await service.launch(getAuthenticatedUserId(res), proposalId) });
    },
  );

  router.post(
    '/proposals/:proposalId/cancel',
    validateRequest({ params: proposalParamsSchema }),
    async (req, res) => {
      const { proposalId } = getValidated<{ proposalId: string }>(res, 'params');
      res.json({ proposal: await service.cancel(getAuthenticatedUserId(res), proposalId) });
    },
  );

  router.post(
    '/proposals/:proposalId/resolve',
    validateRequest({ params: proposalParamsSchema, body: resolveBodySchema }),
    async (req, res) => {
      const { proposalId } = getValidated<{ proposalId: string }>(res, 'params');
      const body = getValidated<{ decisions: ItemDecision[]; note?: string }>(res, 'body');

      res.json({
        proposal: await service.resolve(getAuthenticatedUserId(res), proposalId, {
          decisions: body.decisions,
          ...(body.note === undefined ? {} : { note: body.note }),
        }),
      });
    },
  );

  router.post(
    '/proposals/:proposalId/items/:itemId/respond',
    validateRequest({ params: proposalItemParamsSchema, body: respondBodySchema }),
    async (req, res) => {
      const { proposalId, itemId } = getValidated<{ proposalId: string; itemId: string }>(res, 'params');
      const body = getValidated<{
        response: 'accepted' | 'declined' | 'countered';
        declineReason?: JustifiedDeclineReason;
        counterStart?: string;
        counterDue?: string;
      }>(res, 'body');

      const counterStart = body.counterStart === undefined ? null : parseCalendarDate(body.counterStart);
      const counterDue = body.counterDue === undefined ? null : parseCalendarDate(body.counterDue);
      if (body.response === 'countered' && (counterStart === null || counterDue === null)) {
        throw counterNeedsDates();
      }

      res.json({
        proposal: await service.respond(getAuthenticatedUserId(res), proposalId, itemId, {
          response: body.response,
          ...(body.declineReason === undefined ? {} : { declineReason: body.declineReason }),
          ...(counterStart === null ? {} : { counterStart }),
          ...(counterDue === null ? {} : { counterDue }),
        }),
      });
    },
  );

  router.patch(
    '/proposals/:proposalId/items/:itemId/exclusion',
    validateRequest({ params: proposalItemParamsSchema, body: excludeBodySchema }),
    async (req, res) => {
      const { proposalId, itemId } = getValidated<{ proposalId: string; itemId: string }>(res, 'params');
      const { excluded } = getValidated<{ excluded: boolean }>(res, 'body');

      res.json({
        proposal: await service.setExcluded(getAuthenticatedUserId(res), proposalId, itemId, excluded),
      });
    },
  );

  router.get(
    '/projects/:projectId/proposals',
    validateRequest({ params: projectParamsSchema }),
    async (req, res) => {
      const { projectId } = getValidated<{ projectId: string }>(res, 'params');
      res.json({ proposals: await service.listForProject(getAuthenticatedUserId(res), projectId) });
    },
  );

  router.get(
    '/projects/:projectId/audit',
    validateRequest({ params: projectParamsSchema }),
    async (req, res) => {
      const { projectId } = getValidated<{ projectId: string }>(res, 'params');
      res.json({ entries: await service.auditForProject(getAuthenticatedUserId(res), projectId) });
    },
  );

  router.post(
    '/projects/:projectId/stages/:stageId/partial-release',
    validateRequest({ params: releaseParamsSchema, body: releaseBodySchema }),
    async (req, res) => {
      const { projectId, stageId } = getValidated<{ projectId: string; stageId: string }>(res, 'params');
      const body = getValidated<{ taskIds: string[]; note?: string }>(res, 'body');

      res.status(201).json({
        release: await service.releasePartially(
          getAuthenticatedUserId(res),
          projectId,
          stageId,
          body.taskIds,
          body.note,
        ),
      });
    },
  );

  return router;
};
