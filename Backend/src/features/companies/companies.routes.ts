import { Router, type RequestHandler } from 'express';

import { validateRequest } from '../../middleware/validateRequest.js';
import type { ProfileController } from '../users/profile.controller.js';
import { companyUpdateBodySchema } from '../users/profile.validation.js';

/**
 * Company name, office phone and availability belong to the company, so they are edited through
 * the company's own route even though one screen presents them beside the personal fields. The
 * service checks the caller's `company.manage` permission before anything is written.
 */
export const createCompaniesRouter = (
  controller: ProfileController,
  requireAccessToken: RequestHandler,
): Router => {
  const router = Router();

  router.patch(
    '/me',
    requireAccessToken,
    validateRequest({ body: companyUpdateBodySchema }),
    controller.handleUpdateMyCompany,
  );

  return router;
};
