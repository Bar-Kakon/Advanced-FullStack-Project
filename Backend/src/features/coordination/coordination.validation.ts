import Joi from 'joi';

import { ITEM_RESOLUTIONS, JUSTIFIED_DECLINE_REASONS } from './proposal.model.js';

const objectId = Joi.string().hex().length(24);
const calendarDate = Joi.string().trim().pattern(/^\d{4}-\d{2}-\d{2}$/);

export const proposalParamsSchema = Joi.object({ proposalId: objectId.required() });

export const proposalItemParamsSchema = Joi.object({
  proposalId: objectId.required(),
  itemId: objectId.required(),
});

export const taskParamsSchema = Joi.object({ taskId: objectId.required() });

export const projectParamsSchema = Joi.object({ projectId: objectId.required() });

export const releaseParamsSchema = Joi.object({
  projectId: objectId.required(),
  stageId: objectId.required(),
});

const changesSchema = Joi.object({
  deltaWorkingDays: Joi.number().integer().min(-365).max(365),
  alternativeStart: calendarDate,
  alternativeDue: calendarDate,
  note: Joi.string().trim().max(400),
}).or('deltaWorkingDays', 'alternativeStart', 'alternativeDue');

export const previewBodySchema = Joi.object({
  taskId: objectId.required(),
  changes: changesSchema.required(),
});

export const requestBodySchema = Joi.object({
  taskId: objectId.required(),
  changes: changesSchema.required(),
  reason: Joi.string().trim().max(600),
  responseHours: Joi.number().integer().min(1).max(8760),
});

export const respondBodySchema = Joi.object({
  response: Joi.string().valid('accepted', 'declined', 'countered', 'other_proposed').required(),
  declineReason: Joi.string().valid(...JUSTIFIED_DECLINE_REASONS),
  counterStart: calendarDate,
  counterDue: calendarDate,
  otherSolution: Joi.string().trim().min(1).max(600),
});

export const excludeBodySchema = Joi.object({ excluded: Joi.boolean().required() });

export const resolveBodySchema = Joi.object({
  decisions: Joi.array()
    .items(
      Joi.object({
        itemId: objectId.required(),
        resolution: Joi.string()
          .valid(...ITEM_RESOLUTIONS)
          .required(),
      }),
    )
    .required(),
  note: Joi.string().trim().max(600),
});

export const dateChangeBodySchema = Joi.object({
  deltaWorkingDays: Joi.number().integer().min(-365).max(365),
  alternativeStart: calendarDate,
  alternativeDue: calendarDate,
  note: Joi.string().trim().max(400),
  reason: Joi.string().trim().max(600),
  responseHours: Joi.number().integer().min(1).max(8760),
}).or('deltaWorkingDays', 'alternativeStart', 'alternativeDue');

export const alternativeParamsSchema = Joi.object({
  proposalId: objectId.required(),
  token: Joi.string().trim().max(40).required(),
});

export const alternativesBodySchema = Joi.object({
  earliestStart: calendarDate,
  latestFinishForWork: calendarDate,
  latestFinishForChain: calendarDate,
  mustNotMove: Joi.array().items(objectId).max(50),
  note: Joi.string().trim().max(600),
});

export const handoffParamsSchema = Joi.object({ handoffId: objectId.required() });

export const handoffBodySchema = Joi.object({
  toUserId: objectId.required(),
  completedWorkAtHandover: Joi.string().trim().min(1).max(600).required(),
  proposalId: objectId,
});

export const handoffDecisionSchema = Joi.object({ accept: Joi.boolean().required() });

export const releaseBodySchema = Joi.object({
  taskIds: Joi.array().items(objectId).min(1).required(),
  note: Joi.string().trim().max(400),
});
