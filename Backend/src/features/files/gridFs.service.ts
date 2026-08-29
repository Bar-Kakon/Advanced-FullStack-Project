import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

import mongoose, { Types } from 'mongoose';
import { GridFSBucket } from 'mongodb';

/** Recorded on every asset, so a later move to another store changes a value, not the schema. */
export const GRIDFS_DRIVER = 'gridfs';

const BUCKET_NAME = 'uploads';

let bucket: GridFSBucket | null = null;

/**
 * Built lazily and once. The database connection is opened by `server.ts` long before any upload
 * arrives, and constructing the bucket at import time would bind it to a connection that may not
 * exist yet in a script or a test.
 */
const getBucket = (): GridFSBucket => {
  if (bucket === null) {
    const { db } = mongoose.connection;
    if (!db) throw new Error('GridFS was used before the database connection was open.');
    bucket = new GridFSBucket(db, { bucketName: BUCKET_NAME });
  }
  return bucket;
};

export interface GridFsUpload {
  readonly fileId: Types.ObjectId;
  /** Counted by the store as the bytes land, never taken from a client-supplied header. */
  readonly sizeBytes: number;
}

/** Streams straight through: no part of the file is ever held whole in process memory. */
export const uploadStreamToGridFs = async (
  source: Readable,
  filename: string,
  contentType: string,
): Promise<GridFsUpload> => {
  // The driver no longer takes a contentType option; the authoritative MIME type lives on the
  // fileassets row anyway, and this copy is only for anyone reading fs.files directly.
  const upload = getBucket().openUploadStream(filename, { metadata: { contentType } });

  try {
    await pipeline(source, upload);
  } catch (error) {
    // A cut-off upload has already written chunks. Aborting removes them, so a rejected file
    // leaves nothing behind for a sweep to find later.
    await upload.abort().catch(() => undefined);
    throw error;
  }

  return { fileId: upload.id as Types.ObjectId, sizeBytes: upload.length };
};

export const openGridFsDownloadStream = (fileId: Types.ObjectId): Readable =>
  getBucket().openDownloadStream(fileId);

/** Removing a file that is already gone is success, not an error — cleanup runs on failure paths. */
export const deleteFromGridFs = async (fileId: Types.ObjectId): Promise<void> => {
  try {
    await getBucket().delete(fileId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('File not found')) throw error;
  }
};

/** Test hook: a new connection needs a new bucket. */
export const resetGridFsBucket = (): void => {
  bucket = null;
};
