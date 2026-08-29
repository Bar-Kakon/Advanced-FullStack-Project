import { Router, type RequestHandler } from 'express';

import type { BlocksService } from '../blocks/blocks.service.js';
import { companyRepository } from '../companies/company.repository.js';
import { companyMembershipRepository } from '../companies/companyMembership.repository.js';
import { connectionRepository } from '../connections/connection.repository.js';
import { ratingRepository } from '../ratings/rating.repository.js';
import { userRepository } from '../users/user.repository.js';
import { workEntryRepository } from '../workentries/workEntry.repository.js';
import { createDashboardController } from './dashboard.controller.js';
import { createDashboardService } from './dashboard.service.js';
import { profileReminderDismissalRepository } from './profileReminderDismissal.repository.js';

export interface DashboardModuleDependencies {
  readonly requireAccessToken: RequestHandler;
  readonly blocks: BlocksService;
}

export const createDashboardModule = ({
  requireAccessToken,
  blocks,
}: DashboardModuleDependencies): Router => {
  const controller = createDashboardController(
    createDashboardService({
      users: userRepository,
      companies: companyRepository,
      memberships: companyMembershipRepository,
      connections: connectionRepository,
      blocks,
      ratings: ratingRepository,
      workEntries: workEntryRepository,
      dismissals: profileReminderDismissalRepository,
    }),
  );

  const router = Router();
  router.use(requireAccessToken);

  router.get('/', controller.handleSummary);
  router.post('/profile-reminder/dismiss', controller.handleDismissProfileReminder);

  return router;
};