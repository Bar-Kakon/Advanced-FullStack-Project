import Joi from 'joi';
import { Router, type RequestHandler } from 'express';

import { getValidated, validateRequest } from '../../middleware/validateRequest.js';
import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { buildEntitlementService } from '../billing/billing.module.js';
import { notificationPreferencePort } from '../mutes/notificationPreference.port.js';
import { notificationRepository } from './notification.repository.js';
import {
  createNotificationDispatchService,
  type NotificationDispatchService,
} from './notificationDispatch.service.js';
import {
  createNotificationsService,
  NOTIFICATIONS_DEFAULT_LIMIT,
  NOTIFICATIONS_MAX_LIMIT,
  type NotificationsService,
} from './notifications.service.js';
import { queuedEmailRepository } from './queuedEmail.repository.js';
import { recipientRepository } from './recipient.repository.js';

const listQuerySchema = Joi.object({
  cursor: Joi.string().trim().max(200).optional(),
  limit: Joi.number().integer().min(1).max(NOTIFICATIONS_MAX_LIMIT).default(NOTIFICATIONS_DEFAULT_LIMIT),
  unreadOnly: Joi.boolean().default(false),
});

const seenBodySchema = Joi.object({
  ids: Joi.array().items(Joi.string().hex().length(24)).min(1).max(100).required(),
});

export const buildNotificationDispatchService = (): NotificationDispatchService =>
  createNotificationDispatchService({
    notifications: notificationRepository,
    emails: queuedEmailRepository,
    preferences: notificationPreferencePort,
    entitlements: buildEntitlementService(),
    recipients: recipientRepository,
  });

export const buildNotificationsService = (): NotificationsService =>
  createNotificationsService({
    notifications: notificationRepository,
    emails: queuedEmailRepository,
  });

/**
 * The notification centre. Reading is the only thing a client does here — every row is written by
 * the domain that raised the event, never by a request.
 */
export const createNotificationsModule = (
  requireAccessToken: RequestHandler,
  service: NotificationsService = buildNotificationsService(),
): Router => {
  const router = Router();
  router.use(requireAccessToken);

  router.get('/', validateRequest({ query: listQuerySchema }), async (req, res) => {
    const { cursor, limit, unreadOnly } = getValidated<{
      cursor?: string;
      limit: number;
      unreadOnly: boolean;
    }>(res, 'query');

    res.json(
      await service.list(getAuthenticatedUserId(res), {
        limit,
        cursor: cursor ?? null,
        unreadOnly,
      }),
    );
  });

  // The navbar's unread marker, so it costs one small read rather than a page of rows.
  router.get('/unread-count', async (req, res) => {
    res.json({ unreadCount: await service.unreadCount(getAuthenticatedUserId(res)) });
  });

  router.post('/seen', validateRequest({ body: seenBodySchema }), async (req, res) => {
    const { ids } = getValidated<{ ids: string[] }>(res, 'body');
    res.json({ unreadCount: await service.markSeen(getAuthenticatedUserId(res), ids) });
  });

  router.post('/seen-all', async (req, res) => {
    res.json({ unreadCount: await service.markAllSeen(getAuthenticatedUserId(res)) });
  });

  return router;
};
