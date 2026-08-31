import { Router, type RequestHandler } from 'express';

import { validateRequest } from '../../middleware/validateRequest.js';
import { userRepository } from '../users/user.repository.js';
import { ratingRepository } from './rating.repository.js';
import { createRatingsController } from './ratings.controller.js';
import { workEvidenceAdapter } from '../tasks/workEvidence.adapter.js';
import { createRatingsService } from './ratings.service.js';
import { createRatingBodySchema } from './ratings.validation.js';

export const createRatingsModule = (requireAccessToken: RequestHandler): Router => {
  const controller = createRatingsController(
    createRatingsService({
      ratings: ratingRepository,
      users: userRepository,
      eligibility: workEvidenceAdapter,
    }),
  );

  const router = Router();
  router.use(requireAccessToken);

  router.post('/', validateRequest({ body: createRatingBodySchema }), controller.handleRate);

  return router;
};
