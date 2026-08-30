import { Router } from 'express';

import type { AppConfig } from '../config/env.js';
import { createAuthModule } from '../features/auth/auth.module.js';
import { createBlocksModule } from '../features/blocks/blocks.module.js';
import { createBrowseModule } from '../features/browse/browse.module.js';
import { createCompaniesModule } from '../features/companies/companies.module.js';
import { createConnectionsModule } from '../features/connections/connections.module.js';
import { createDashboardModule } from '../features/dashboard/dashboard.module.js';
import { createLocationModule } from '../features/location/location.module.js';
import { createNetworkModule } from '../features/network/network.module.js';
import { createProjectsModule } from '../features/projects/projects.module.js';
import { createCalendarModule } from '../features/calendar/calendar.module.js';
import { createPermissionsModule } from '../features/projectaccess/permissions.module.js';
import {
  createProjectInvitationsModule,
  createProjectMembersModule,
} from '../features/projectmembers/projectMembers.module.js';
import { createGoogleRoutesAdapter } from '../features/location/routes.adapter.js';
import { createRatingsModule } from '../features/ratings/ratings.module.js';
import { createUsersModule } from '../features/users/users.module.js';
import { createHealthRouter } from './health.routes.js';
import { createHealthAuthRouter } from './healthAuth.routes.js';

/**
 * The API composition root. A feature module is mounted here with a single line and nothing else in
 * the bootstrap changes.
 */
export const createApiRouter = (config: AppConfig): Router => {
  const router = Router();
  const auth = createAuthModule(config);
  const users = createUsersModule(auth.requireAccessToken);
  const blocks = createBlocksModule(auth.requireAccessToken);
  const connections = createConnectionsModule(auth.requireAccessToken, blocks.service);
  const routes = createGoogleRoutesAdapter(config.googleMaps);

  router.use('/health', createHealthRouter());
  router.use('/health-auth', createHealthAuthRouter(auth.requireAccessToken));
  router.use('/auth', auth.router);
  router.use('/users', users.router);
  router.use('/companies', createCompaniesModule(auth.requireAccessToken, users.companyProfileRoutes));
  router.use('/blocks', blocks.router);
  router.use('/connections', connections.router);
  router.use(
    '/dashboard',
    createDashboardModule({ requireAccessToken: auth.requireAccessToken, blocks: blocks.service }),
  );
  router.use('/network', createNetworkModule(auth.requireAccessToken));
  router.use(
    '/projects/:projectId/members',
    createProjectMembersModule(auth.requireAccessToken, blocks.service),
  );
  router.use('/project-invitations', createProjectInvitationsModule(auth.requireAccessToken));
  router.use('/projects', createProjectsModule(auth.requireAccessToken));
  router.use('/calendar', createCalendarModule(auth.requireAccessToken));
  router.use('/permissions', createPermissionsModule(auth.requireAccessToken));
  router.use('/ratings', createRatingsModule(auth.requireAccessToken));
  router.use('/location', createLocationModule(auth.requireAccessToken, config.googleMaps, routes));
  router.use(
    '/browse',
    createBrowseModule({
      requireAccessToken: auth.requireAccessToken,
      blocks: blocks.service,
      relationships: connections.relationships,
      routes,
    }),
  );

  return router;
};
