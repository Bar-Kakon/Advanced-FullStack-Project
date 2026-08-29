import type { Request, RequestHandler, Response } from 'express';

import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import type { StoredUpload } from '../files/fileAsset.service.js';
import { getValidated } from '../../middleware/validateRequest.js';
import { fileNotAvailable } from '../files/file.errors.js';
import type { ProfileService } from './profile.service.js';
import type {
  CompanyUpdateBody,
  ProfileUpdateBody,
  WorkEntryBody,
  WorkEntryUpdateBody,
} from './profile.validation.js';

export interface ProfileController {
  readonly handleGetMe: RequestHandler;
  readonly handleUpdateMe: RequestHandler;
  readonly handleUpdateMyCompany: RequestHandler;
  readonly handleAddWorkEntry: RequestHandler;
  readonly handleUpdateWorkEntry: RequestHandler;
  readonly handleRemoveWorkEntry: RequestHandler;
  readonly handleSetAvatar: RequestHandler;
  readonly handleRemoveAvatar: RequestHandler;
  readonly handleGetAsset: RequestHandler;
}

export interface ProfileControllerDependencies {
  readonly profiles: ProfileService;
}

/** What Multer stored, if this request carried a file at all. */
const readUpload = (req: Request): StoredUpload | null => {
  const file = req.file;
  const fileId = req.gridFsFileId;
  if (file === undefined || fileId === undefined) return null;

  return {
    gridFsFileId: fileId,
    filename: file.originalname,
    mimeType: file.mimetype,
    sizeBytes: file.size,
  };
};

/**
 * The HTTP boundary for the profile screens: read what the middleware already proved and
 * validated, call one use case, send the result. The caller's identity always comes from the
 * verified Access Token, never from the URL or the body.
 */
export const createProfileController = ({
  profiles,
}: ProfileControllerDependencies): ProfileController => ({
  handleGetMe: async (_req: Request, res: Response) => {
    res.json({ user: await profiles.get(getAuthenticatedUserId(res)) });
  },

  handleUpdateMe: async (_req: Request, res: Response) => {
    const patch = getValidated<ProfileUpdateBody>(res, 'body');
    res.json({ user: await profiles.update(getAuthenticatedUserId(res), patch) });
  },

  handleUpdateMyCompany: async (_req: Request, res: Response) => {
    const patch = getValidated<CompanyUpdateBody>(res, 'body');
    res.json({ user: await profiles.updateCompany(getAuthenticatedUserId(res), patch) });
  },

  handleAddWorkEntry: async (req: Request, res: Response) => {
    const entry = getValidated<WorkEntryBody>(res, 'body');
    const created = await profiles.addWorkEntry(getAuthenticatedUserId(res), entry, readUpload(req));

    res.status(201).json({ entry: created });
  },

  handleUpdateWorkEntry: async (req: Request, res: Response) => {
    const { id } = getValidated<{ id: string }>(res, 'params');
    const edit = getValidated<WorkEntryUpdateBody>(res, 'body');
    const updated = await profiles.updateWorkEntry(
      getAuthenticatedUserId(res), id, edit, readUpload(req),
    );

    res.json({ entry: updated });
  },

  handleRemoveWorkEntry: async (_req: Request, res: Response) => {
    const { id } = getValidated<{ id: string }>(res, 'params');
    await profiles.removeWorkEntry(getAuthenticatedUserId(res), id);

    res.status(204).send();
  },

  handleSetAvatar: async (req: Request, res: Response) => {
    const upload = readUpload(req);
    // Multer accepts a request with no file part; the avatar route is the one place that is not
    // acceptable, so it is refused here rather than stored as an empty avatar.
    if (upload === null) throw fileNotAvailable();

    res.json({ user: await profiles.setAvatar(getAuthenticatedUserId(res), upload) });
  },

  handleRemoveAvatar: async (_req: Request, res: Response) => {
    res.json({ user: await profiles.removeAvatar(getAuthenticatedUserId(res)) });
  },

  /**
   * Serves an asset the caller owns. The lookup is scoped by owner, so knowing an id proves
   * nothing and another person's file answers exactly as a missing one.
   */
  handleGetAsset: async (_req: Request, res: Response) => {
    const { id } = getValidated<{ id: string }>(res, 'params');
    const userId = getAuthenticatedUserId(res);
    const { asset, stream } = await profiles.openAsset(userId, id);

    res.type(asset.mimeType);
    res.setHeader('Content-Length', String(asset.sizeBytes));
    res.setHeader('Cache-Control', 'private, max-age=300');
    // Piped straight from the store, so a large image never becomes a buffer in this process.
    stream.on('error', () => res.destroy());
    stream.pipe(res);
  },
});
