import { Router } from 'express';

import type { AppConfig } from '../config/env.js';
import { createAuthModule } from '../features/auth/auth.module.js';
import { createBillingModule } from '../features/billing/billing.module.js';
import { createBlocksModule } from '../features/blocks/blocks.module.js';
import { createBrowseModule } from '../features/browse/browse.module.js';
import { createCompaniesModule } from '../features/companies/companies.module.js';
import { createContactModule } from '../features/contact/contact.module.js';
import { createConnectionsModule } from '../features/connections/connections.module.js';
import { createDashboardModule } from '../features/dashboard/dashboard.module.js';
import { createLocationModule } from '../features/location/location.module.js';
import { createNetworkModule } from '../features/network/network.module.js';
import { createWorkPlansModule } from '../features/workplans/workplans.module.js';
import { createProjectsModule } from '../features/projects/projects.module.js';
import { createCalendarModule } from '../features/calendar/calendar.module.js';
import { createPermissionsModule } from '../features/projectaccess/permissions.module.js';
import { createProjectDashboardModule } from '../features/projectdashboard/projectDashboard.module.js';
import {
  createProjectInvitationsModule,
  createProjectMembersModule,
} from '../features/projectmembers/projectMembers.module.js';
import { createGoogleRoutesAdapter } from '../features/location/routes.adapter.js';
import { createRatingsModule } from '../features/ratings/ratings.module.js';
import { createTasksModule } from '../features/tasks/tasks.module.js';
import { createStagesModule } from '../features/tasks/stages.module.js';
import { createUsersModule } from '../features/users/users.module.js';
import {
  buildCoordinationService,
  createCoordinationModule,
} from '../features/coordination/coordination.module.js';
import { responsibilityTransferListener } from '../features/coordination/membershipOutcome.adapter.js';
import { createMutesModule } from '../features/mutes/mutes.module.js';
import { createNotificationsModule } from '../features/notifications/notifications.module.js';
import { createScheduleExceptionsModule } from '../features/scheduleexceptions/scheduleExceptions.module.js';
import { createSettingsModule } from '../features/settings/settings.module.js';
import { createReportsModule } from '../features/reports/reports.module.js';
import { createModerationModule } from '../features/moderation/moderation.module.js';
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
  const coordination = buildCoordinationService();

  const billing = createBillingModule(config, auth.requireAccessToken, config.apiPublicUrl);

  router.use('/health', createHealthRouter());
  router.use('/health-auth', createHealthAuthRouter(auth.requireAccessToken));
  router.use('/auth', auth.router);
  // Public, like the Landing page it is submitted from: there is no session to require.
  router.use('/contact', createContactModule(config).router);
  router.use('/users', users.router);
  router.use('/companies', createCompaniesModule(auth.requireAccessToken, users.companyProfileRoutes));
  router.use('/blocks', blocks.router);
  router.use('/connections', connections.router);
  router.use(
    '/dashboard',
    createDashboardModule({ requireAccessToken: auth.requireAccessToken, blocks: blocks.service }),
  );
  router.use('/billing', billing.router);
  router.use('/network', createNetworkModule(auth.requireAccessToken));
  // Filing a report and reviewing one are two different authorities, so they are two routers.
  router.use('/reports', createReportsModule(auth.requireAccessToken).router);
  router.use('/moderation', createModerationModule(auth.requireAccessToken));
  router.use('/work-plans', createWorkPlansModule(auth.requireAccessToken));
  router.use('/coordination', createCoordinationModule(auth.requireAccessToken, coordination));
  router.use('/mutes', createMutesModule(auth.requireAccessToken));
  router.use('/notifications', createNotificationsModule(auth.requireAccessToken));
  router.use('/schedule-exceptions', createScheduleExceptionsModule(auth.requireAccessToken));
  router.use('/settings', createSettingsModule(auth.requireAccessToken));
  router.use('/projects/:projectId/stages', createStagesModule(auth.requireAccessToken));
  router.use('/projects/:projectId/dashboard', createProjectDashboardModule(auth.requireAccessToken));
  router.use(
    '/projects/:projectId/members',
    createProjectMembersModule(auth.requireAccessToken, blocks.service),
  );
  router.use(
    '/project-invitations',
    createProjectInvitationsModule(
      auth.requireAccessToken,
      responsibilityTransferListener(coordination),
    ),
  );
  router.use('/projects', createProjectsModule(auth.requireAccessToken));
  router.use('/calendar', createCalendarModule(auth.requireAccessToken));
  router.use('/permissions', createPermissionsModule(auth.requireAccessToken));
  router.use('/tasks', createTasksModule(auth.requireAccessToken));
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
