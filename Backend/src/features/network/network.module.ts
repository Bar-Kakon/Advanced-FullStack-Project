import { Router, type RequestHandler } from 'express';

import { validateRequest } from '../../middleware/validateRequest.js';
import { ratingRepository } from '../ratings/rating.repository.js';
import { createNetworkController } from './network.controller.js';
import { networkRepository } from './network.repository.js';
import { createNetworkService } from './network.service.js';
import { blockedListQuerySchema, networkListQuerySchema } from './network.validation.js';

/**
 * Reading only. Accept, decline, withdraw and remove stay on `/connections`, and unblock stays on
 * `/blocks`, so My Network drives the same transitions Browse does rather than a second copy.
 */
export const createNetworkModule = (requireAccessToken: RequestHandler): Router => {
  const controller = createNetworkController(
    createNetworkService({ network: networkRepository, ratings: ratingRepository }),
  );

  const router = Router();
  router.use(requireAccessToken);

  router.get('/connections', validateRequest({ query: networkListQuerySchema }), controller.handleList);
  router.get('/blocks', validateRequest({ query: blockedListQuerySchema }), controller.handleListBlocked);

  return router;
};
