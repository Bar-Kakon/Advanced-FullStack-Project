import type { Request, RequestHandler } from 'express';
import multer, { MulterError, type StorageEngine } from 'multer';
import type { Types } from 'mongoose';

import { AppError } from '../../shared/errors.js';
import { ALLOWED_IMAGE_MIME_TYPES } from './fileAsset.model.js';
import { deleteFromGridFs, uploadStreamToGridFs } from './gridFs.service.js';
import { fileTooLarge, unexpectedFileField, unsupportedFileType } from './file.errors.js';

/** 5 MB, which is what the Edit profile screen already tells people. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by the GridFS storage engine once the bytes are safely stored. */
    gridFsFileId?: Types.ObjectId;
  }
}

/**
 * A Multer storage engine that pipes the incoming file straight into GridFS.
 *
 * Multer ships memory and disk storage and neither is usable here: disk is ephemeral on Heroku,
 * and memory would hold a whole upload in the process. This is the third option Multer is designed
 * for — the file part arrives as a stream and leaves as a stream, so nothing is ever buffered
 * whole.
 */
const gridFsStorage: StorageEngine = {
  _handleFile(req, file, callback) {
    void uploadStreamToGridFs(file.stream, file.originalname, file.mimetype)
      .then(({ fileId, sizeBytes }) => {
        req.gridFsFileId = fileId;
        callback(null, { size: sizeBytes });
      })
      .catch((error: unknown) => callback(error as Error));
  },

  _removeFile(req, _file, callback) {
    const fileId = req.gridFsFileId;
    if (!fileId) {
      callback(null);
      return;
    }
    void deleteFromGridFs(fileId).then(() => callback(null), (error: unknown) => callback(error as Error));
  },
};

const fileFilter = (_req: Request, file: Express.Multer.File, callback: multer.FileFilterCallback): void => {
  // The declared MIME type is checked, never the filename extension — an extension is whatever the
  // uploader typed.
  if ((ALLOWED_IMAGE_MIME_TYPES as readonly string[]).includes(file.mimetype)) {
    callback(null, true);
    return;
  }
  callback(unsupportedFileType());
};

/**
 * One optional image, under one named field. `single` is what makes an unexpected file field an
 * error rather than something silently ignored, and the count limit is Multer's, not a check of
 * ours that could be forgotten.
 */
export const uploadSingleImage = (fieldName: string): RequestHandler => {
  const handler = multer({
    storage: gridFsStorage,
    fileFilter,
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1 },
  }).single(fieldName);

  return (req, res, next) => {
    handler(req, res, (error: unknown) => {
      if (!error) {
        next();
        return;
      }
      // Multer's own failures are translated into the project's error contract rather than
      // reaching the handler as a library-shaped object.
      if (error instanceof MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') return next(fileTooLarge());
        if (error.code === 'LIMIT_UNEXPECTED_FILE' || error.code === 'LIMIT_FILE_COUNT') {
          return next(unexpectedFileField());
        }
        return next(new AppError('Upload rejected', 400, 'REQUEST_VALIDATION_FAILED'));
      }
      return next(error);
    });
  };
};
