import { Router, type RequestHandler } from 'express';
import { Types } from 'mongoose';

import { getValidated, validateRequest } from '../../middleware/validateRequest.js';
import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { blockRepository } from '../blocks/block.repository.js';
import { companyRepository } from '../companies/company.repository.js';
import { companyMembershipRepository } from '../companies/companyMembership.repository.js';
import { createCompanyContextService } from '../companies/companyContext.service.js';
import { companyCalendarRepository } from '../calendar/companyCalendar.repository.js';
import { buildNotificationDispatchService } from '../notifications/notifications.module.js';
import { projectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import { participantRepository } from '../projectmembers/participant.repository.js';
import { projectRepository } from '../projects/project.repository.js';
import { reportRepository } from '../reports/report.repository.js';
import type { ReportReason } from '../reports/report.model.js';
import { createTaskCreationService } from '../tasks/taskCreation.service.js';
import { taskRepository } from '../tasks/task.repository.js';
import { userRepository } from '../users/user.repository.js';
import { createAgreementTaskAdapter } from './agreementTask.adapter.js';
import { createMessagingService, type AgreementInput } from './messaging.service.js';
import { messagingRepository } from './messaging.repository.js';
import { messageNotFound } from './messaging.errors.js';
import {
  agreementBodySchema,
  conversationIdParamsSchema,
  historyQuerySchema,
  inboxQuerySchema,
  messageIdParamsSchema,
  projectIdParamsSchema,
  reportMessageBodySchema,
  sendMessageBodySchema,
  startDirectBodySchema,
  userIdParamsSchema,
  type AgreementBody,
  type HistoryQueryInput,
  type InboxQueryInput,
  type ReportMessageBody,
  type SendMessageBody,
  type StartDirectBody,
} from './messaging.validation.js';

/**
 * Messaging. Every route is authenticated and none of them trusts a participant id from the body:
 * who the caller is comes from the Access Token, and what they may read is decided in the service
 * against live project membership and the conversation's own participants.
 */
export const createMessagingModule = (requireAccessToken: RequestHandler): Router => {
  const notifications = buildNotificationDispatchService();

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
    notifications,
  });

  const service = createMessagingService({
    conversations: messagingRepository,
    users: userRepository,
    blocks: blockRepository,
    access: projectAccessRepository,
    projects: projectRepository,
    notifications,
    tasks: createAgreementTaskAdapter(creation),
  });

  const router = Router();
  router.use(requireAccessToken);

  const me = (res: Parameters<RequestHandler>[1]): string => getAuthenticatedUserId(res);

  router.get('/', validateRequest({ query: inboxQuerySchema }), async (_req, res) => {
    const { folder, limit, cursor } = getValidated<InboxQueryInput>(res, 'query');
    res.json(await service.inbox(me(res), folder, limit, cursor));
  });

  // First contact. It opens a message request when no conversation exists yet, and a connection is
  // never consulted — connections do not gate a first message.
  router.post(
    '/direct/:userId',
    validateRequest({ params: userIdParamsSchema, body: startDirectBodySchema }),
    async (_req, res) => {
      const { userId } = getValidated<{ userId: string }>(res, 'params');
      const { body } = getValidated<StartDirectBody>(res, 'body');
      res.status(201).json({ conversation: await service.startDirect(me(res), userId, body) });
    },
  );

  router.get(
    '/project/:projectId',
    validateRequest({ params: projectIdParamsSchema }),
    async (_req, res) => {
      const { projectId } = getValidated<{ projectId: string }>(res, 'params');
      res.json({ conversation: await service.projectRoom(me(res), projectId) });
    },
  );

  router.get(
    '/:conversationId/messages',
    validateRequest({ params: conversationIdParamsSchema, query: historyQuerySchema }),
    async (_req, res) => {
      const { conversationId } = getValidated<{ conversationId: string }>(res, 'params');
      const { limit, cursor } = getValidated<HistoryQueryInput>(res, 'query');
      res.json(await service.history(me(res), conversationId, limit, cursor));
    },
  );

  router.post(
    '/:conversationId/messages',
    validateRequest({ params: conversationIdParamsSchema, body: sendMessageBodySchema }),
    async (_req, res) => {
      const { conversationId } = getValidated<{ conversationId: string }>(res, 'params');
      const { body } = getValidated<SendMessageBody>(res, 'body');
      res.status(201).json({ message: await service.send(me(res), conversationId, body) });
    },
  );

  router.post(
    '/:conversationId/accept',
    validateRequest({ params: conversationIdParamsSchema }),
    async (_req, res) => {
      const { conversationId } = getValidated<{ conversationId: string }>(res, 'params');
      await service.answerRequest(me(res), conversationId, true);
      res.status(204).end();
    },
  );

  router.post(
    '/:conversationId/decline',
    validateRequest({ params: conversationIdParamsSchema }),
    async (_req, res) => {
      const { conversationId } = getValidated<{ conversationId: string }>(res, 'params');
      await service.answerRequest(me(res), conversationId, false);
      res.status(204).end();
    },
  );

  // "Delete this chat". It hides the conversation for this caller and destroys nothing.
  router.delete(
    '/:conversationId',
    validateRequest({ params: conversationIdParamsSchema }),
    async (_req, res) => {
      const { conversationId } = getValidated<{ conversationId: string }>(res, 'params');
      await service.hide(me(res), conversationId);
      res.status(204).end();
    },
  );

  router.post(
    '/:conversationId/agreements',
    validateRequest({ params: conversationIdParamsSchema, body: agreementBodySchema }),
    async (_req, res) => {
      const { conversationId } = getValidated<{ conversationId: string }>(res, 'params');
      const body = getValidated<AgreementBody>(res, 'body');

      const input: AgreementInput = {
        title: body.title,
        ...(body.description === undefined ? {} : { description: body.description }),
        startDate: body.startDate,
        dueDate: body.dueDate,
        ...(body.projectId === undefined ? {} : { projectId: body.projectId }),
      };

      res
        .status(201)
        .json({ message: await service.proposeAgreement(me(res), conversationId, input) });
    },
  );

  router.post(
    '/:conversationId/agreements/:messageId/accept',
    validateRequest({ params: messageIdParamsSchema }),
    async (_req, res) => {
      const { conversationId, messageId } = getValidated<{
        conversationId: string;
        messageId: string;
      }>(res, 'params');
      res.json({
        message: await service.answerAgreement(me(res), conversationId, messageId, true),
      });
    },
  );

  router.post(
    '/:conversationId/agreements/:messageId/decline',
    validateRequest({ params: messageIdParamsSchema }),
    async (_req, res) => {
      const { conversationId, messageId } = getValidated<{
        conversationId: string;
        messageId: string;
      }>(res, 'params');
      res.json({
        message: await service.answerAgreement(me(res), conversationId, messageId, false),
      });
    },
  );

  /**
   * Messaging reporting reuses the EXISTING reports collection — one moderation domain, one queue.
   * The reporter is the session, never the body, and their identity never reaches another user.
   */
  router.post(
    '/:conversationId/messages/:messageId/report',
    validateRequest({ params: messageIdParamsSchema, body: reportMessageBodySchema }),
    async (_req, res) => {
      const { conversationId, messageId } = getValidated<{
        conversationId: string;
        messageId: string;
      }>(res, 'params');
      const { reason, note } = getValidated<ReportMessageBody>(res, 'body');
      const code = reason as ReportReason;

      // Reachability first, so an id in another pair's thread cannot be probed or reported.
      await service.reachable(me(res), conversationId);
      const message = await messagingRepository.findMessage(messageId);
      if (message === null || message.conversation.toString() !== conversationId) {
        throw messageNotFound();
      }

      const report = await reportRepository.create({
        reporter: new Types.ObjectId(me(res)),
        subjectType: 'message',
        subjectId: message._id,
        reason: code,
        ...(note === undefined ? {} : { note }),
        source: 'conversation',
      });

      res.status(201).json({ reportId: report?._id.toString() ?? null });
    },
  );

  return router;
};
