import { Router, type RequestHandler } from 'express';
import { Types } from 'mongoose';

import { createReportRateLimiter } from '../../middleware/rateLimit.js';
import { getValidated, validateRequest } from '../../middleware/validateRequest.js';
import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { auditRepository } from '../coordination/audit.repository.js';
import { fileNotAvailable, fileTooLarge } from '../files/file.errors.js';
import { fileAssetRepository } from '../files/fileAsset.repository.js';
import { createFileAssetService } from '../files/fileAsset.service.js';
import { openGridFsDownloadStream } from '../files/gridFs.service.js';
import { MAX_IMAGE_BYTES, uploadSingleAttachment } from '../files/upload.middleware.js';
import { blockRepository } from '../blocks/block.repository.js';
import { muteRepository } from '../mutes/mute.repository.js';
import { connectionRepository } from '../connections/connection.repository.js';
import { companyRepository } from '../companies/company.repository.js';
import { companyMembershipRepository } from '../companies/companyMembership.repository.js';
import { createCompanyContextService } from '../companies/companyContext.service.js';
import { companyCalendarRepository } from '../calendar/companyCalendar.repository.js';
import { buildNotificationDispatchService } from '../notifications/notifications.module.js';
import { projectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import { participantRepository } from '../projectmembers/participant.repository.js';
import { projectRepository } from '../projects/project.repository.js';
import { scheduleWrites } from '../projects/scheduleWrites.instance.js';
import { reportRepository } from '../reports/report.repository.js';
import type { ReportReason } from '../reports/report.model.js';
import { createTaskCreationService } from '../tasks/taskCreation.service.js';
import { taskRepository } from '../tasks/task.repository.js';
import { userRepository } from '../users/user.repository.js';
import { createAgreementTaskAdapter } from './agreementTask.adapter.js';
import { createCommissioningAdapter } from './commissioning.adapter.js';
import { createMessagingService, type AgreementInput } from './messaging.service.js';
import { messagingRepository } from './messaging.repository.js';
import { messageNotFound } from './messaging.errors.js';
import {
  agreementBodySchema,
  conversationIdParamsSchema,
  fileParamsSchema,
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

  const companyContext = createCompanyContextService({
    memberships: companyMembershipRepository,
    companies: companyRepository,
  });

  const creation = createTaskCreationService({
    tasks: taskRepository,
    projects: projectRepository,
    access: projectAccessRepository,
    participants: participantRepository,
    calendars: companyCalendarRepository,
    companyContext,
    notifications,
    schedule: scheduleWrites,
  });

  const service = createMessagingService({
    conversations: messagingRepository,
    users: userRepository,
    blocks: blockRepository,
    access: projectAccessRepository,
    projects: projectRepository,
    notifications,
    tasks: createAgreementTaskAdapter(creation),
    files: fileAssetRepository,
    audit: auditRepository,
    commissioning: createCommissioningAdapter(companyContext),
    mutes: muteRepository,
    connections: {
      isAccepted: async (a, b) => (await connectionRepository.findByPair(a, b))?.status === 'accepted',
    },
  });

  const fileAssets = createFileAssetService(fileAssetRepository);

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
      const input = getValidated<SendMessageBody>(res, 'body');
      res.status(201).json({ message: await service.send(me(res), conversationId, input) });
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

  // Delete-for-everyone of the caller's OWN message. The row survives behind the placeholder.
  router.delete(
    '/:conversationId/messages/:messageId',
    validateRequest({ params: messageIdParamsSchema }),
    async (_req, res) => {
      const { conversationId, messageId } = getValidated<{
        conversationId: string;
        messageId: string;
      }>(res, 'params');
      res.json({ message: await service.deleteOwnMessage(me(res), conversationId, messageId) });
    },
  );

  // Hides one message for the caller alone. The row, and every other view of it, are untouched.
  router.post(
    '/:conversationId/messages/:messageId/hide',
    validateRequest({ params: messageIdParamsSchema }),
    async (_req, res) => {
      const { conversationId, messageId } = getValidated<{
        conversationId: string;
        messageId: string;
      }>(res, 'params');
      await service.hideMessage(me(res), conversationId, messageId);
      res.status(204).end();
    },
  );

  // Moderation removal, Project Rooms only: the GC's role or an explicit `room.moderate` grant.
  router.post(
    '/:conversationId/messages/:messageId/remove',
    validateRequest({ params: messageIdParamsSchema }),
    async (_req, res) => {
      const { conversationId, messageId } = getValidated<{
        conversationId: string;
        messageId: string;
      }>(res, 'params');
      res.json({ message: await service.removeMessage(me(res), conversationId, messageId) });
    },
  );

  // An explicit keep. It outranks both deletion paths and is deliberately irreversible.
  router.post(
    '/:conversationId/messages/:messageId/keep',
    validateRequest({ params: messageIdParamsSchema }),
    async (_req, res) => {
      const { conversationId, messageId } = getValidated<{
        conversationId: string;
        messageId: string;
      }>(res, 'params');
      res.json({ message: await service.keepMessage(me(res), conversationId, messageId) });
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
        ...(body.attachments === undefined ? {} : { attachments: body.attachments }),
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
    createReportRateLimiter(),
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

  // One attachment per request, stored before it is sent: the send names the returned id.
  router.post(
    '/:conversationId/attachments',
    uploadSingleAttachment('file'),
    validateRequest({ params: conversationIdParamsSchema }),
    async (req, res) => {
      const { conversationId } = getValidated<{ conversationId: string }>(res, 'params');

      const file = req.file;
      const gridFsFileId = req.gridFsFileId;
      if (file === undefined || gridFsFileId === undefined) throw fileNotAvailable();

      try {
        const conversation = await service.reachable(me(res), conversationId);

        // Multer holds one byte ceiling for both kinds, so the image ceiling is enforced here.
        if (file.mimetype !== 'application/pdf' && file.size > MAX_IMAGE_BYTES) throw fileTooLarge();

        const asset = await fileAssets.record(new Types.ObjectId(me(res)), 'message', {
          gridFsFileId,
          filename: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: file.size,
        });
        await fileAssetRepository.attachToScopeId(asset._id, conversation._id);

        res.status(201).json({
          attachment: {
            id: asset._id.toString(),
            filename: asset.filename,
            mimeType: asset.mimeType,
            sizeBytes: asset.sizeBytes,
          },
        });
      } catch (error) {
        await fileAssets.discardOrphan(gridFsFileId);
        throw error;
      }
    },
  );

  // Reading an attachment is conversation membership, not ownership — with one exception: an
  // upload not yet sent is visible to its uploader alone.
  router.get(
    '/:conversationId/files/:fileId',
    validateRequest({ params: fileParamsSchema }),
    async (_req, res) => {
      const { conversationId, fileId } = getValidated<{
        conversationId: string;
        fileId: string;
      }>(res, 'params');
      const conversation = await service.reachable(me(res), conversationId);

      const asset = await fileAssetRepository.findMessageScoped(fileId, conversation._id);
      if (asset === null) throw messageNotFound();

      const carrier = await messagingRepository.findMessageWithAttachment(
        conversation._id,
        asset._id,
      );
      if (carrier === null && asset.owner.toString() !== me(res)) throw messageNotFound();
      if (carrier !== null && (carrier.removedAt !== undefined || carrier.deletedAt !== undefined)) {
        throw messageNotFound();
      }

      res.type(asset.mimeType);
      res.setHeader('Content-Length', String(asset.sizeBytes));
      res.setHeader('Cache-Control', 'private, max-age=300');
      const stream = openGridFsDownloadStream(asset.storage.fileId);
      stream.on('error', () => res.destroy());
      stream.pipe(res);
    },
  );

  return router;
};
