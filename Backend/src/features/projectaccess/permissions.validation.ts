import Joi from 'joi';

import { PROJECT_PERMISSIONS } from './projectPermission.js';
import { PROJECT_ROLES } from './projectMembership.model.js';

const permissionList = Joi.array().items(Joi.string().valid(...PROJECT_PERMISSIONS)).max(50);

export const grantBodySchema = Joi.object({
  projectId: Joi.string().trim().required(),
  userId: Joi.string().trim().required(),
  projectRole: Joi.string().valid(...PROJECT_ROLES).required(),
  permissions: permissionList.optional(),
  fullAuthority: Joi.boolean().optional(),
  templateId: Joi.string().trim().optional(),
  copyFromGrantId: Joi.string().trim().optional(),
})
  // A grant comes from exactly one source, so nobody has to guess which one won.
  .oxor('templateId', 'copyFromGrantId')
  .oxor('permissions', 'templateId')
  .oxor('permissions', 'copyFromGrantId');

export const grantUpdateBodySchema = Joi.object({
  projectRole: Joi.string().valid(...PROJECT_ROLES).optional(),
  permissions: permissionList.optional(),
  fullAuthority: Joi.boolean().optional(),
}).min(1);

export const templateBodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(80).required(),
  permissions: permissionList.default([]),
  fullAuthority: Joi.boolean().default(false),
});

export const grantParamsSchema = Joi.object({ grantId: Joi.string().trim().required() });
export const templateParamsSchema = Joi.object({ templateId: Joi.string().trim().required() });
