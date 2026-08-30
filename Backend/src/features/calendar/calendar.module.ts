import { Router, type RequestHandler } from 'express';
import { Types } from 'mongoose';

import { validateRequest, getValidated } from '../../middleware/validateRequest.js';
import { companyRepository } from '../companies/company.repository.js';
import { companyMembershipRepository } from '../companies/companyMembership.repository.js';
import { createCompanyContextService } from '../companies/companyContext.service.js';
import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { companyCalendarBodySchema } from '../projects/projects.validation.js';
import { noActiveCompany, notPermittedToCreate } from '../projects/project.errors.js';
import { companyCalendarRepository, configOrDefault } from './companyCalendar.repository.js';
import type { WorkingCalendarConfig } from './workingCalendar.types.js';

/**
 * The company default, read and edited as a chain of frozen versions. An edit never rewrites a
 * version — it appends the next one, which is what keeps every pinned project exactly where it was.
 */
export const createCalendarModule = (requireAccessToken: RequestHandler): Router => {
  const companyContext = createCompanyContextService({
    memberships: companyMembershipRepository,
    companies: companyRepository,
  });

  const router = Router();
  router.use(requireAccessToken);

  const activeCompany = async (userId: string) => {
    const context = await companyContext.forUser(userId);
    if (context === null || context.membershipStatus !== 'active') throw noActiveCompany();
    return context;
  };

  router.get('/company', async (req, res) => {
    const context = await activeCompany(getAuthenticatedUserId(res));
    const company = new Types.ObjectId(context.id);
    const current = await companyCalendarRepository.findCurrent(company);
    const versions = await companyCalendarRepository.listVersions(company);

    res.json({
      current: {
        versionId: current?._id.toString() ?? null,
        version: current?.version ?? 0,
        config: configOrDefault(current),
      },
      versions: versions.map((v) => ({
        versionId: v._id.toString(),
        version: v.version,
        config: v.config,
        createdAt: v.createdAt.toISOString(),
      })),
    });
  });

  router.put('/company', validateRequest({ body: companyCalendarBodySchema }), async (req, res) => {
    const userId = getAuthenticatedUserId(res);
    const context = await activeCompany(userId);
    if (!context.permissions.includes('company.manage')) throw notPermittedToCreate();

    const config = getValidated<WorkingCalendarConfig>(res, 'body');
    const appended = await companyCalendarRepository.append(
      new Types.ObjectId(context.id),
      config,
      new Types.ObjectId(userId),
    );

    res.status(201).json({
      versionId: appended._id.toString(),
      version: appended.version,
      config: appended.config,
    });
  });

  return router;
};
