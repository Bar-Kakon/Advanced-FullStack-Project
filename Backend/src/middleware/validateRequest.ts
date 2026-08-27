import type { RequestHandler, Response } from 'express';
import type { ObjectSchema } from 'joi';

import { AppError } from '../shared/errors.js';

export type RequestPart = 'body' | 'query' | 'params';

export type RequestSchemas = Partial<Record<RequestPart, ObjectSchema>>;

type ValidatedParts = Partial<Record<RequestPart, unknown>>;

const VALIDATION_OPTIONS = { abortEarly: false, stripUnknown: true, convert: true } as const;

/**
 * Validated values are written to `res.locals` rather than back onto the request, because
 * `req.query` is a getter in Express 5 and cannot be reassigned.
 */
export const validateRequest =
  (schemas: RequestSchemas): RequestHandler =>
  (req, res, next) => {
    const validated: ValidatedParts = {};

    for (const part of Object.keys(schemas) as RequestPart[]) {
      const schema = schemas[part];
      if (!schema) continue;

      const { value, error } = schema.validate(req[part], VALIDATION_OPTIONS);
      if (error) {
        next(new AppError(error.message, 400, 'REQUEST_VALIDATION_FAILED'));
        return;
      }

      validated[part] = value;
    }

    res.locals.validated = validated;
    next();
  };

export const getValidated = <T>(res: Response, part: RequestPart): T => {
  const validated = res.locals.validated as ValidatedParts | undefined;
  const value = validated?.[part];

  if (value === undefined) {
    throw new Error(`Route read a validated ${part} that validateRequest never produced.`);
  }

  return value as T;
};
