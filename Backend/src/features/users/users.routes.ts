import { Router, type RequestHandler } from 'express';
import Joi from 'joi';

import { validateRequest } from '../../middleware/validateRequest.js';
import { uploadSingleImage } from '../files/upload.middleware.js';
import type { ProfileController } from './profile.controller.js';
import {
  profileUpdateBodySchema,
  workEntryBodySchema,
  workEntryUpdateBodySchema,
} from './profile.validation.js';

export const AVATAR_FIELD = 'avatar';
export const WORK_IMAGE_FIELD = 'image';

const idParamsSchema = Joi.object({
  id: Joi.string().hex().length(24).required(),
});

/**
 * Every route sits behind `requireAccessToken`, and none of them names a user in its path: the
 * profile a request can reach is the one its token proves, so there is no id to tamper with.
 *
 * On the two upload routes Multer runs before `validateRequest`, because the text fields of a
 * multipart request do not exist until the parser has read it.
 */
export const createUsersRouter = (
  controller: ProfileController,
  requireAccessToken: RequestHandler,
): Router => {
  const router = Router();
  router.use(requireAccessToken);

  router.get('/me', controller.handleGetMe);
  router.patch('/me', validateRequest({ body: profileUpdateBodySchema }), controller.handleUpdateMe);

  router.post(
    '/me/work-entries',
    uploadSingleImage(WORK_IMAGE_FIELD),
    validateRequest({ body: workEntryBodySchema }),
    controller.handleAddWorkEntry,
  );
  router.patch(
    '/me/work-entries/:id',
    uploadSingleImage(WORK_IMAGE_FIELD),
    validateRequest({ params: idParamsSchema, body: workEntryUpdateBodySchema }),
    controller.handleUpdateWorkEntry,
  );
  router.delete(
    '/me/work-entries/:id',
    validateRequest({ params: idParamsSchema }),
    controller.handleRemoveWorkEntry,
  );

  router.put('/me/avatar', uploadSingleImage(AVATAR_FIELD), controller.handleSetAvatar);
  router.delete('/me/avatar', controller.handleRemoveAvatar);

  router.get('/me/assets/:id', validateRequest({ params: idParamsSchema }), controller.handleGetAsset);

  return router;
};
