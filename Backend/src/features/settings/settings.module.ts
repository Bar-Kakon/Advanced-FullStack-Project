import Joi from 'joi';
import { Router, type RequestHandler } from 'express';

import { getValidated, validateRequest } from '../../middleware/validateRequest.js';
import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { buildEntitlementService } from '../billing/billing.module.js';
import { muteRepository } from '../mutes/mute.repository.js';
import { projectRepository } from '../projects/project.repository.js';
import type { ContactVisibility, NotificationTimingRule, UserLanguage } from '../users/user.model.js';
import { settingsRepository } from './settings.repository.js';
import { createSettingsService, type SettingsService } from './settings.service.js';

const languageBodySchema = Joi.object({
  language: Joi.string().valid('he', 'en').required(),
});

/**
 * The timing fields are accepted from any account and dropped by the service when the plan does
 * not carry them. Refusing the whole request instead would stop a Free account editing the
 * operational-email opt-in that sits beside them.
 */
const notificationsBodySchema = Joi.object({
  operationalEmail: Joi.boolean(),
  timing: Joi.array()
    .max(2)
    .items(
      Joi.object({
        notificationClass: Joi.string().valid('blocking', 'nonblocking').required(),
        quietFromMinute: Joi.number().integer().min(0).max(1440).required(),
        quietToMinute: Joi.number().integer().min(0).max(1440).required(),
      }),
    ),
  digestHour: Joi.number().integer().min(0).max(23),
}).min(1);

const contactVisibilityBodySchema = Joi.object({
  email: Joi.boolean(),
  businessPhone: Joi.boolean(),
  officePhone: Joi.boolean(),
}).min(1);

export const buildSettingsService = (): SettingsService =>
  createSettingsService({
    settings: settingsRepository,
    mutes: muteRepository,
    projects: projectRepository,
    entitlements: buildEntitlementService(),
  });

/**
 * Account settings. Every route acts on the account behind the Access Token and takes no user id,
 * so there is no shape in which one person's request could edit another's preferences.
 */
export const createSettingsModule = (
  requireAccessToken: RequestHandler,
  service: SettingsService = buildSettingsService(),
): Router => {
  const router = Router();
  router.use(requireAccessToken);

  router.get('/', async (req, res) => {
    res.json({ settings: await service.read(getAuthenticatedUserId(res)) });
  });

  router.put('/language', validateRequest({ body: languageBodySchema }), async (req, res) => {
    const { language } = getValidated<{ language: UserLanguage }>(res, 'body');
    res.json({ settings: await service.setLanguage(getAuthenticatedUserId(res), language) });
  });

  router.put(
    '/notifications',
    validateRequest({ body: notificationsBodySchema }),
    async (req, res) => {
      const body = getValidated<{
        operationalEmail?: boolean;
        timing?: NotificationTimingRule[];
        digestHour?: number;
      }>(res, 'body');

      res.json({ settings: await service.setNotifications(getAuthenticatedUserId(res), body) });
    },
  );

  router.put(
    '/contact-visibility',
    validateRequest({ body: contactVisibilityBodySchema }),
    async (req, res) => {
      const body = getValidated<Partial<ContactVisibility>>(res, 'body');
      res.json({ settings: await service.setContactVisibility(getAuthenticatedUserId(res), body) });
    },
  );

  return router;
};
