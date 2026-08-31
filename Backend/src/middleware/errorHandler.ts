import type { ErrorRequestHandler } from 'express';

import { isAppError } from '../shared/errors.js';
import { logger } from '../shared/logger.js';

interface BodyParserError extends Error {
  readonly type?: string;
}

const isBodyParserError = (error: unknown): error is BodyParserError =>
  error instanceof Error && typeof (error as BodyParserError).type === 'string';

const describe = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

/**
 * The single place a failure becomes a response. Every answer is `{ code, message }`; anything
 * not deliberately raised is reported as a generic internal error and only ever detailed in the
 * server log.
 */
export const errorHandler: ErrorRequestHandler = (error, req, res, next) => {
  if (res.headersSent) {
    next(error);
    return;
  }

  if (isAppError(error)) {
    if (error.statusCode >= 500) {
      logger.error('Server-side AppError', {
        method: req.method,
        path: req.path,
        code: error.code,
        stack: error.stack,
      });
    }
    res.status(error.statusCode).json({ code: error.code, message: error.message });
    return;
  }

  if (isBodyParserError(error)) {
    if (error.type === 'entity.parse.failed') {
      res.status(400).json({ code: 'MALFORMED_JSON_BODY', message: 'Request body is not valid JSON' });
      return;
    }
    if (error.type === 'entity.too.large') {
      res
        .status(413)
        .json({ code: 'REQUEST_BODY_TOO_LARGE', message: 'Request body exceeds the maximum allowed size' });
      return;
    }
  }

  logger.error('Unhandled error', {
    method: req.method,
    path: req.path,
    error: describe(error),
    stack: error instanceof Error ? error.stack : undefined,
  });

  res.status(500).json({ code: 'INTERNAL_SERVER_ERROR', message: 'Internal server error' });
};
