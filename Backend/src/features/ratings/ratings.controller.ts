import type { Request, RequestHandler, Response } from 'express';

import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { getValidated } from '../../middleware/validateRequest.js';
import type { RatingsService } from './ratings.service.js';
import type { CreateRatingBody } from './ratings.validation.js';

export interface RatingsController {
  readonly handleRate: RequestHandler;
}

export const createRatingsController = (service: RatingsService): RatingsController => ({
  handleRate: async (req: Request, res: Response) => {
    const input = getValidated<CreateRatingBody>(res, 'body');
    await service.rate(getAuthenticatedUserId(res), input);

    res.status(201).json({ rated: true });
  },
});
