import { Router } from 'express';

import type { AppConfig } from '../../config/env.js';
import { createMailer } from '../../mail/mailer.js';
import { createContactRateLimiter } from '../../middleware/rateLimit.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { createContactController } from './contact.controller.js';
import { createContactService, type ContactService } from './contact.service.js';
import { submitContactMessageBodySchema } from './contact.validation.js';
import { contactMessageRepository } from './contactMessage.repository.js';

export interface ContactModule {
  readonly router: Router;
  readonly service: ContactService;
}

/**
 * Submission only, and deliberately public: the Landing page is signed out, so requiring a token
 * here would make the form unreachable by the only people it exists for. Nothing in this router
 * reads or lists a message — the stored inbox has no endpoint at all.
 */
export const createContactModule = (config: AppConfig): ContactModule => {
  const service = createContactService({
    messages: contactMessageRepository,
    mailer: createMailer(config.mail),
    inbox: config.contact.inbox,
  });
  const controller = createContactController(service);

  const router = Router();

  // The only gate on an unauthenticated write, so it comes before validation: a flood is rejected
  // without ever being parsed.
  router.post(
    '/messages',
    createContactRateLimiter(),
    validateRequest({ body: submitContactMessageBodySchema }),
    controller.handleSubmitMessage,
  );

  return { router, service };
};
