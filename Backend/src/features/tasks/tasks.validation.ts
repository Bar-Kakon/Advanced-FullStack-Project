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

export const createStageBodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(120).required(),
  isGate: Joi.boolean().default(false),
  order: Joi.number().integer().min(0).optional(),
});

export const updateStageBodySchema = Joi.object({
  name: Joi.string().trim().min(1).max(120),
  isGate: Joi.boolean(),
  order: Joi.number().integer().min(0),
}).min(1);

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const calendarDate = Joi.string().trim().pattern(CALENDAR_DATE).required();

/**
 * The two kinds ask for different things, so the body is discriminated rather than made of
 * everything-optional fields that a service would then have to re-check.
 */
export const createTaskBodySchema = Joi.object({
  kind: Joi.string()
    .valid(...TASK_KINDS)
    .required(),
  title: Joi.string().trim().min(1).max(200).required(),
  description: Joi.string().trim().max(2000).optional(),
  startDate: calendarDate,
  dueDate: calendarDate,

  projectId: Joi.when('kind', {
    is: 'project',
    then: Joi.string().trim().required(),
    otherwise: Joi.forbidden(),
  }),
  // A project task must belong to a stage — owner decision, not a shortcut to relax later.
  stageId: Joi.when('kind', {
    is: 'project',
    then: Joi.string().trim().required(),
    otherwise: Joi.forbidden(),
  }),
  // Standalone work is always its creator's own, so naming an assignee is refused rather than ignored.
  assigneeId: Joi.when('kind', {
    is: 'project',
    then: Joi.string().trim().required(),
    otherwise: Joi.forbidden(),
  }),
  ownCrewOnly: Joi.when('kind', {
    is: 'project',
    then: Joi.boolean().default(false),
    otherwise: Joi.forbidden(),
  }),
  delegatorOnSiteRequired: Joi.when('kind', {
    is: 'project',
    then: Joi.boolean().default(false),
    otherwise: Joi.forbidden(),
  }),
});

export const projectOptionsParamsSchema = Joi.object({
  projectId: Joi.string().trim().required(),
});
