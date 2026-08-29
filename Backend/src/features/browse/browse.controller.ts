import type { Request, RequestHandler, Response } from 'express';

import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { getValidated } from '../../middleware/validateRequest.js';
import type { Availability } from '../companies/company.model.js';
import type { Region, Trade } from '../users/user.model.js';
import type { BrowseService } from './browse.service.js';
import type { PublicProfileService } from './publicProfile.service.js';
import type { BrowseSearchQuery, ContractorParams } from './browse.validation.js';

export interface BrowseController {
  readonly handleSearch: RequestHandler;
  readonly handleProfile: RequestHandler;
}

export const createBrowseController = (
  browse: BrowseService,
  profiles: PublicProfileService,
): BrowseController => ({
  handleSearch: async (req: Request, res: Response) => {
    const query = getValidated<BrowseSearchQuery>(res, 'query');

    const page = await browse.search(getAuthenticatedUserId(res), {
      limit: query.limit,
      ...(query.q === undefined ? {} : { text: query.q }),
      ...(query.specialty === undefined ? {} : { specialties: query.specialty as Trade[] }),
      ...(query.region === undefined ? {} : { regions: query.region as Region[] }),
      ...(query.availability === undefined ? {} : { availability: query.availability as Availability[] }),
      ...(query.placeId === undefined ? {} : { approvedPlaceId: query.placeId }),
      ...(query.originPlaceId === undefined ? {} : { originPlaceId: query.originPlaceId }),
      ...(query.maxDrivingKm === undefined ? {} : { maxDrivingKm: query.maxDrivingKm }),
      ...(query.minRating === undefined ? {} : { minRating: query.minRating }),
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    });

    res.json(page);
  },

  handleProfile: async (req: Request, res: Response) => {
    const { userId } = getValidated<ContractorParams>(res, 'params');
    const profile = await profiles.forViewer(getAuthenticatedUserId(res), userId);

    res.json({ profile });
  },
});
