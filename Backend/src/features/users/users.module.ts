import type { Router, RequestHandler } from 'express';

import { companyRepository } from '../companies/company.repository.js';
import { companyMembershipRepository } from '../companies/companyMembership.repository.js';
import { createCompaniesRouter } from '../companies/companies.routes.js';
import { fileAssetRepository } from '../files/fileAsset.repository.js';
import { createFileAssetService } from '../files/fileAsset.service.js';
import { workEntryRepository } from '../workentries/workEntry.repository.js';
import { createProfileController } from './profile.controller.js';
import { unbuiltCoordinationOutcomePort } from '../flexibility/coordinationOutcome.port.js';
import { createFlexibilityService } from '../flexibility/flexibility.service.js';
import { createProfileService } from './profile.service.js';
import { userRepository } from './user.repository.js';
import { createUsersRouter } from './users.routes.js';
import { workVerificationService } from './workEntryVerification.service.js';

export interface UsersModule {
  readonly router: Router;
  /** Mounted by `createCompaniesModule`, which owns the `/companies` prefix. */
  readonly companyProfileRoutes: Router;
}

/**
 * The profile feature's composition root. It borrows `requireAccessToken` from the auth module
 * rather than building its own, so there is exactly one implementation of "who is this".
 */
export const createUsersModule = (requireAccessToken: RequestHandler): UsersModule => {
  const profiles = createProfileService({
    users: userRepository,
    companies: companyRepository,
    memberships: companyMembershipRepository,
    workEntries: workEntryRepository,
    files: createFileAssetService(fileAssetRepository),
    verification: workVerificationService,
    flexibility: createFlexibilityService(unbuiltCoordinationOutcomePort),
  });

  const controller = createProfileController({ profiles });

  return {
    router: createUsersRouter(controller, requireAccessToken),
    companyProfileRoutes: createCompaniesRouter(controller),
  };
};
