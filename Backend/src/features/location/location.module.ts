import { Router, type RequestHandler } from 'express';

import type { GoogleMapsConfig } from '../../config/env.js';
import { validateRequest } from '../../middleware/validateRequest.js';
import { userRepository } from '../users/user.repository.js';
import { createLocationController } from './location.controller.js';
import { createLocationService } from './location.service.js';
import { proposeTravelBodySchema, saveTravelBodySchema } from './location.validation.js';
import { createGooglePlacesAdapter } from './places.adapter.js';
import type { RoutesAdapter } from './routes.adapter.js';
import { createTravelService } from './travel.service.js';

export const createLocationModule = (
  requireAccessToken: RequestHandler,
  googleMaps: GoogleMapsConfig,
  routes: RoutesAdapter,
): Router => {
  const controller = createLocationController(
    createTravelService({ places: createGooglePlacesAdapter(googleMaps), routes }),
    createLocationService({ users: userRepository }),
  );

  const router = Router();
  router.use(requireAccessToken);

  router.get('/travel', controller.handleMine);
  router.post('/travel/proposal', validateRequest({ body: proposeTravelBodySchema }), controller.handlePropose);
  router.put('/travel', validateRequest({ body: saveTravelBodySchema }), controller.handleSave);

  return router;
};
