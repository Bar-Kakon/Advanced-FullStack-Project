import type { Types } from 'mongoose';

import { logger } from '../../shared/logger.js';
import type { FileAssetRecord, FileScope } from './fileAsset.model.js';
import type { FileAssetRepository } from './fileAsset.repository.js';
import { deleteFromGridFs, openGridFsDownloadStream, GRIDFS_DRIVER } from './gridFs.service.js';
import { fileNotAvailable } from './file.errors.js';

export interface StoredUpload {
  readonly gridFsFileId: Types.ObjectId;
  readonly filename: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}

export interface FileAssetService {
  record(owner: Types.ObjectId, scope: FileScope, upload: StoredUpload): Promise<FileAssetRecord>;
  /** Both halves, in the order that cannot orphan bytes: row first, then the bytes. */
  remove(assetId: Types.ObjectId, gridFsFileId: Types.ObjectId): Promise<void>;
  /** Best-effort cleanup for a request that failed after the bytes were already written. */
  discardOrphan(gridFsFileId: Types.ObjectId): Promise<void>;
  /** The row alone, for callers that need to delete an asset rather than serve it. */
  findOwned(id: Types.ObjectId, owner: Types.ObjectId): Promise<FileAssetRecord | null>;
  openOwnedStream(id: string, owner: Types.ObjectId): Promise<{ asset: FileAssetRecord; stream: NodeJS.ReadableStream }>;
}

export const createFileAssetService = (assets: FileAssetRepository): FileAssetService => ({
  async record(owner, scope, upload) {
    return assets.create({
      owner,
      scope: { type: scope, id: null },
      filename: upload.filename,
      mimeType: upload.mimeType,
      sizeBytes: upload.sizeBytes,
      storage: { driver: GRIDFS_DRIVER, fileId: upload.gridFsFileId },
    });
  },

  async remove(assetId, gridFsFileId) {
    // The row goes first. Losing the row leaves unreferenced bytes, which a sweep can find; losing
    // the bytes while the row survives leaves a reference that resolves to nothing, which the UI
    // would render as a broken image.
    await assets.deleteById(assetId);
    await deleteFromGridFs(gridFsFileId);
  },

  async discardOrphan(gridFsFileId) {
    try {
      await deleteFromGridFs(gridFsFileId);
    } catch (error) {
      // The request has already failed; this must not replace its error with a cleanup one.
      logger.error('Failed to discard an orphaned upload', {
        fileId: gridFsFileId.toString(),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  },

  async findOwned(id, owner) {
    return assets.findOwnedById(id.toString(), owner);
  },

  async openOwnedStream(id, owner) {
    const asset = await assets.findOwnedById(id, owner);
    // Knowing an id is not authorization: an asset belonging to somebody else answers exactly as a
    // non-existent one does.
    if (asset === null) throw fileNotAvailable();

    return { asset, stream: openGridFsDownloadStream(asset.storage.fileId) };
  },
});
