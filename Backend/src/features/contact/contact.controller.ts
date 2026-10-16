import type { Request, RequestHandler, Response } from 'express';

import { getValidated } from '../../middleware/validateRequest.js';
import type { ContactService } from './contact.service.js';
import type { SubmitContactMessageBody } from './contact.validation.js';

export interface ContactController {
  readonly handleSubmitMessage: RequestHandler;
}

export const createContactController = (service: ContactService): ContactController => ({
  /** 201 with the receipt and nothing else — no inbox address and no delivery status. */
  handleSubmitMessage: async (_req: Request, res: Response) => {
    const body = getValidated<SubmitContactMessageBody>(res, 'body');

    const message = await service.submitMessage(body);

    res.status(201).json({ message });
  },
});
