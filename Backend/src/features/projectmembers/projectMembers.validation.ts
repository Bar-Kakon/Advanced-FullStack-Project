import Joi from 'joi';

import { PROJECT_ROLES } from '../projectaccess/projectMembership.model.js';
import { PROJECT_PERMISSIONS } from '../projectaccess/projectPermission.js';

export const projectScopeParamsSchema = Joi.object({
  projectId: Joi.string().trim().required(),
});

export const membershipParamsSchema = projectScopeParamsSchema.keys({
  membershipId: Joi.string().trim().required(),
});

export const invitationParamsSchema = Joi.object({
  membershipId: Joi.string().trim().required(),
});

/** One source of authority per invitation, so there is never a merge rule to argue about. */
export const inviteBodySchema = Joi.object({
  userId: Joi.string().trim().required(),
  projectRole: Joi.string()
    .valid(...PROJECT_ROLES)
    .required(),
  permissions: Joi.array()
    .items(Joi.string().valid(...PROJECT_PERMISSIONS))
    .optional(),
  fullAuthority: Joi.boolean().optional(),
  templateId: Joi.string().trim().optional(),
  copyFromGrantId: Joi.string().trim().optional(),
})
  .oxor('templateId', 'copyFromGrantId')
  .oxor('permissions', 'templateId')
  .oxor('permissions', 'copyFromGrantId');

export const memberRoleBodySchema = Joi.object({
  projectRole: Joi.string()
    .valid(...PROJECT_ROLES)
    .required(),
});
