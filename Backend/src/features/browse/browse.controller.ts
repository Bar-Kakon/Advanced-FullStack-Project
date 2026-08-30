import type { Request, RequestHandler, Response } from 'express';

import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { getValidated } from '../../middleware/validateRequest.js';
import type { Availability } from '../companies/company.model.js';
import type { Region, RegistrationCategory, Specialty } from '../users/user.model.js';
import type { BrowseService } from './browse.service.js';
import type { PublicProfileService } from './publicProfile.service.js';
import type { BrowseSearchQuery, ContractorParams, WorkImageParams } from './browse.validation.js';

export interface BrowseController {
  readonly handleSearch: RequestHandler;
  readonly handleProfile: RequestHandler;
  readonly handleAvatar: RequestHandler;
  readonly handleWorkImage: RequestHandler;
}

/** Piped straight from the store, so a large image never becomes a buffer in this process. */
const sendAsset = (
  res: Response,
  { asset, stream }: { asset: { mimeType: string; sizeBytes: number }; stream: NodeJS.ReadableStream },
): void => {
  res.type(asset.mimeType);
  res.setHeader('Content-Length', String(asset.sizeBytes));
  res.setHeader('Cache-Control', 'private, max-age=300');
  stream.on('error', () => res.destroy());
  stream.pipe(res);
};

export const createBrowseController = (
  browse: BrowseService,
  profiles: PublicProfileService,
): BrowseController => ({
  handleSearch: async (req: Request, res: Response) => {
    const query = getValidated<BrowseSearchQuery>(res, 'query');

    const page = await browse.search(getAuthenticatedUserId(res), {
      limit: query.limit,
      ...(query.q === undefined ? {} : { text: query.q }),
      ...(query.category === undefined ? {} : { categories: query.category as RegistrationCategory[] }),
      ...(query.specialty === undefined ? {} : { specialties: query.specialty as Specialty[] }),
      ...(query.region === undefined ? {} : { regions: query.region as Region[] }),
      ...(query.availability === undefined ? {} : { availability: query.availability as Availability[] }),
      ...(query.placeId === undefined ? {} : { approvedPlaceId: query.placeId }),
      ...(query.originPlaceId === undefined ? {} : { originPlaceId: query.originPlaceId }),
      ...(query.maxDrivingKm === undefined ? {} : { maxDrivingKm: query.maxDrivingKm }),
      ...(query.minRating === undefined ? {} : { minRating: query.minRating }),
      sort: query.sort,
      ...(query.cursor === undefined ? {} : { cursor: query.cursor }),
    });

    res.json(page);
  },

  handleProfile: async (_req: Request, res: Response) => {
    const { userId } = getValidated<ContractorParams>(res, 'params');
    const profile = await profiles.forViewer(getAuthenticatedUserId(res), userId);

    res.json({ profile });
  },

  handleAvatar: async (_req: Request, res: Response) => {
    const { userId } = getValidated<ContractorParams>(res, 'params');
    sendAsset(res, await profiles.openAvatar(getAuthenticatedUserId(res), userId));
  },

  handleWorkImage: async (_req: Request, res: Response) => {
    const { userId, entryId } = getValidated<WorkImageParams>(res, 'params');
    sendAsset(res, await profiles.openWorkImage(getAuthenticatedUserId(res), userId, entryId));
  },
});
