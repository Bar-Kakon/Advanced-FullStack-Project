import type { RequestHandler } from 'express';

import { AppError } from '../shared/errors.js';

/**
 * Answers "no route matched" only. It carries no authorization meaning — whether a *forbidden*
 * resource answers 404 or 403 is open decision D16 and is not settled here.
 */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(new AppError(`Route ${req.method} ${req.path} not found`, 404, 'ROUTE_NOT_FOUND'));
};
