import { Router, type Request, type RequestHandler, type Response } from 'express';

import { getValidated, validateRequest } from '../../middleware/validateRequest.js';
import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import { fileAssetRepository } from '../files/fileAsset.repository.js';
import { createFileAssetService } from '../files/fileAsset.service.js';
import type { StoredUpload } from '../files/fileAsset.service.js';
import type { FileVisibility, WorkPlanScope } from '../files/fileAsset.model.js';
import { uploadSingleDocument } from '../files/upload.middleware.js';
import { projectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import { buildNotificationDispatchService } from '../notifications/notifications.module.js';
import { participantRepository } from '../projectmembers/participant.repository.js';
import { taskRepository } from '../tasks/task.repository.js';
import { workPlanFileRequired } from './workPlan.errors.js';
import { workPlanRepository } from './workPlan.repository.js';
import { createWorkPlanService } from './workPlan.service.js';
import {
  assetParamsSchema,
  groupParamsSchema,
  markCurrentBodySchema,
  scopeParamsSchema,
  uploadBodySchema,
} from './workPlan.validation.js';

const FIELD = 'plan';

/** The bytes are already in GridFS by the time a handler runs; this reads what the engine recorded. */
const storedUpload = (req: Request): StoredUpload => {
  const file = req.file;
  const gridFsFileId = req.gridFsFileId;
  if (!file || !gridFsFileId) throw workPlanFileRequired();

  return {
    gridFsFileId,
    filename: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
  };
};

export const createWorkPlansModule = (requireAccessToken: RequestHandler): Router => {
  const plans = createWorkPlanService({
    plans: workPlanRepository,
    tasks: taskRepository,
    access: projectAccessRepository,
    participants: participantRepository,
    notifications: buildNotificationDispatchService(),
  });
  const files = createFileAssetService(fileAssetRepository);

  const router = Router();
  router.use(requireAccessToken);

  /**
   * An upload that is refused after the bytes have landed must take them with it, or GridFS keeps
   * a file no row points at. Multer's own `_removeFile` only runs for failures it raises itself.
   */
  const withOrphanCleanup = async (req: Request, work: () => Promise<void>): Promise<void> => {
    try {
      await work();
    } catch (error) {
      if (req.gridFsFileId) await files.discardOrphan(req.gridFsFileId);
      throw error;
    }
  };

  // Route order is load-bearing: `/:scopeType/:scopeId` would otherwise swallow
  // `/<group>/versions` and `/<group>/current`, whose second segment is a literal.
  router.get('/assets/:assetId/content', validateRequest({ params: assetParamsSchema }), async (_req, res) => {
    const { assetId } = getValidated<{ assetId: string }>(res, 'params');
    const { asset, stream } = await plans.openContent(getAuthenticatedUserId(res), assetId);

    res.type(asset.mimeType);
    res.setHeader('Content-Length', String(asset.sizeBytes));
    res.setHeader('Cache-Control', 'private, max-age=300');
    // Piped straight from the store, so a 30 MB plan never becomes a buffer in this process.
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  });

  router.post(
    '/:groupId/versions',
    uploadSingleDocument(FIELD),
    validateRequest({ params: groupParamsSchema }),
    async (req: Request, res: Response) => {
      const { groupId } = getValidated<{ groupId: string }>(res, 'params');
      await withOrphanCleanup(req, async () => {
        const plan = await plans.addVersion(getAuthenticatedUserId(res), groupId, storedUpload(req));
        res.status(201).json({ plan });
      });
    },
  );

  router.get('/:groupId/versions', validateRequest({ params: groupParamsSchema }), async (_req, res) => {
    const { groupId } = getValidated<{ groupId: string }>(res, 'params');
    res.json({ versions: await plans.listVersions(getAuthenticatedUserId(res), groupId) });
  });

  router.post(
    '/:groupId/current',
    validateRequest({ params: groupParamsSchema, body: markCurrentBodySchema }),
    async (_req, res) => {
      const { groupId } = getValidated<{ groupId: string }>(res, 'params');
      const { version } = getValidated<{ version: number }>(res, 'body');
      res.json({ versions: await plans.markCurrent(getAuthenticatedUserId(res), groupId, version) });
    },
  );

  router.post(
    '/:scopeType/:scopeId',
    uploadSingleDocument(FIELD),
    validateRequest({ params: scopeParamsSchema, body: uploadBodySchema }),
    async (req: Request, res: Response) => {
      const { scopeType, scopeId } = getValidated<{ scopeType: WorkPlanScope; scopeId: string }>(res, 'params');
      const { visibility } = getValidated<{ visibility: FileVisibility }>(res, 'body');
      await withOrphanCleanup(req, async () => {
        const plan = await plans.upload(
          getAuthenticatedUserId(res),
          { type: scopeType, id: scopeId },
          visibility,
          storedUpload(req),
        );
        res.status(201).json({ plan });
      });
    },
  );

  router.get('/:scopeType/:scopeId', validateRequest({ params: scopeParamsSchema }), async (_req, res) => {
    const { scopeType, scopeId } = getValidated<{ scopeType: WorkPlanScope; scopeId: string }>(res, 'params');
    res.json({ plans: await plans.listForScope(getAuthenticatedUserId(res), { type: scopeType, id: scopeId }) });
  });

  return router;
};
