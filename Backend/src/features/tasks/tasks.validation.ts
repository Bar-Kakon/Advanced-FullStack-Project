import Joi from 'joi';

import { TASK_KINDS } from './task.model.js';
import { TASK_STATES } from './taskState.js';

export const MY_TASKS_DEFAULT_LIMIT = 20;
export const MY_TASKS_MAX_LIMIT = 50;

/** The four controls the approved prototype carries, and nothing invented beside them. */
export const myTasksQuerySchema = Joi.object({
  projectId: Joi.string().trim().optional(),
  noProject: Joi.boolean().optional(),
  kind: Joi.string()
    .valid(...TASK_KINDS)
    .optional(),
  state: Joi.string()
    .valid(...TASK_STATES)
    .optional(),
  sort: Joi.string().valid('due_asc', 'due_desc').default('due_asc'),
  cursor: Joi.string().trim().max(200).optional(),
  limit: Joi.number().integer().min(1).max(MY_TASKS_MAX_LIMIT).default(MY_TASKS_DEFAULT_LIMIT),
})
  // "All projects" and "No project" are one control, so naming both would ask two questions at once.
  .oxor('projectId', 'noProject');

export const taskParamsSchema = Joi.object({
  taskId: Joi.string().trim().required(),
});

export const delegateBodySchema = Joi.object({
  userId: Joi.string().trim().required(),
  scope: Joi.string().valid('whole', 'part').required(),
  partDescription: Joi.string().trim().max(400).optional(),
});

export const privateItemBodySchema = Joi.object({
  kind: Joi.string().valid('subtask', 'note').required(),
  body: Joi.string().trim().min(1).max(1000).required(),
});

export const privateToggleBodySchema = Joi.object({
  done: Joi.boolean().required(),
});

export const privateItemParamsSchema = taskParamsSchema.keys({
  itemId: Joi.string().trim().required(),
});

export const stageDependenciesBodySchema = Joi.object({
  dependsOn: Joi.array().items(Joi.string().trim()).required(),
});
