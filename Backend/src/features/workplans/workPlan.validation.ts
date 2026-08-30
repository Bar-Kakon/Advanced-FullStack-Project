import Joi from 'joi';

import { FILE_VISIBILITIES, WORK_PLAN_SCOPES } from '../files/fileAsset.model.js';

const objectId = Joi.string().hex().length(24).required();

export const scopeParamsSchema = Joi.object({
  scopeType: Joi.string()
    .valid(...WORK_PLAN_SCOPES)
    .required(),
  scopeId: objectId,
});

export const groupParamsSchema = Joi.object({ groupId: objectId });

export const assetParamsSchema = Joi.object({ assetId: objectId });

/**
 * Multipart text fields arrive as strings, so visibility is validated here rather than trusted.
 * There is deliberately no default: publishing where the party above can read is an explicit act.
 */
export const uploadBodySchema = Joi.object({
  visibility: Joi.string()
    .valid(...FILE_VISIBILITIES)
    .required(),
});

export const markCurrentBodySchema = Joi.object({
  version: Joi.number().integer().min(1).required(),
});
