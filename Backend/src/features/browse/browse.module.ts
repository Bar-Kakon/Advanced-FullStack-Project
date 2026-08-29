import { Router, type RequestHandler } from 'express';

import { validateRequest } from '../../middleware/validateRequest.js';
import type { BlocksService } from '../blocks/blocks.service.js';
import type { RelationshipService } from '../connections/relationship.service.js';
import { companyRepository } from '../companies/company.repository.js';
import { companyMembershipRepository } from '../companies/companyMembership.repository.js';
import type { RoutesAdapter } from '../location/routes.adapter.js';
import { ratingRepository } from '../ratings/rating.repository.js';
import { userRepository } from '../users/user.repository.js';
import { workEntryRepository } from '../workentries/workEntry.repository.js';
import { browseRepository } from './browse.repository.js';
import { createBrowseController } from './browse.controller.js';
import { createBrowseService } from './browse.service.js';
import { browseSearchQuerySchema, contractorParamsSchema } from './browse.validation.js';
import { createPhoneVisibilityService } from './phoneVisibility.service.js';
import { createPublicProfileService } from './publicProfile.service.js';

export interface BrowseModuleDependencies {
  readonly requireAccessToken: RequestHandler;
  readonly blocks: BlocksService;
  readonly relationships: RelationshipService;
  readonly routes: RoutesAdapter;
}

export const createBrowseModule = ({
  requireAccessToken,
  blocks,
  relationships,
  routes,
}: BrowseModuleDependencies): Router => {
  const controller = createBrowseController(
    createBrowseService({
      browse: browseRepository,
      blocks,
      relationships,
      ratings: ratingRepository,
      routes,
    }),
    createPublicProfileService({
      users: userRepository,
      companies: companyRepository,
      memberships: companyMembershipRepository,
      workEntries: workEntryRepository,
      ratings: ratingRepository,
      relationships,
      blocks,
      phones: createPhoneVisibilityService(),
    }),
  );

  const router = Router();
  router.use(requireAccessToken);

  router.get('/contractors', validateRequest({ query: browseSearchQuerySchema }), controller.handleSearch);
  router.get(
    '/contractors/:userId',
    validateRequest({ params: contractorParamsSchema }),
    controller.handleProfile,
  );

  return router;
};