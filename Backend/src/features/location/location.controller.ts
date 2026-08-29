import type { Request, RequestHandler, Response } from 'express';

import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { getValidated } from '../../middleware/validateRequest.js';
import type { LocationService } from './location.service.js';
import type { TravelService } from './travel.service.js';
import type { ProposeTravelBody, SaveTravelBody } from './location.validation.js';

export interface LocationController {
  readonly handlePropose: RequestHandler;
  readonly handleSave: RequestHandler;
}

export const createLocationController = (
  travel: TravelService,
  locations: LocationService,
): LocationController => ({
  /** A proposal only. Nothing is persisted until the person confirms their edited list. */
  handlePropose: async (req: Request, res: Response) => {
    const { originPlaceId, travelRadiusKm } = getValidated<ProposeTravelBody>(res, 'body');
    const proposal = await travel.propose(originPlaceId, travelRadiusKm);

    res.json(proposal);
  },

  handleSave: async (req: Request, res: Response) => {
    const input = getValidated<SaveTravelBody>(res, 'body');
    await locations.saveTravelPreferences(getAuthenticatedUserId(res), input);

    res.json({ saved: true, count: input.approvedTravelLocations.length });
  },
});
