import { AppError } from '../../shared/errors.js';

export const notPermittedToCreateTask = (): AppError =>
  new AppError('This account may not create work in this project.', 403, 'TASK_CREATE_DENIED');

/** Naming somebody else is an assignment, and assignment is its own grant. */
export const notPermittedToAssign = (): AppError =>
  new AppError('This account may not assign work to another person.', 403, 'TASK_ASSIGN_DENIED');

export const notPermittedToCreateStandalone = (): AppError =>
  new AppError('This account may not open standalone work.', 403, 'STANDALONE_CREATE_DENIED');

export const dueBeforeStart = (): AppError =>
  new AppError('The due date cannot precede the start date.', 400, 'DUE_BEFORE_START');

export const outsideProjectWindow = (): AppError =>
  new AppError(
    'The dates fall outside the project window, which ends at the overrun allowance.',
    400,
    'TASK_OUTSIDE_PROJECT_WINDOW',
  );

export const assigneeNotMember = (): AppError =>
  new AppError('Work can only be assigned to an active member of the project.', 409, 'ASSIGNEE_NOT_MEMBER');

export const stageRequired = (): AppError =>
  new AppError('A project task must belong to a stage.', 400, 'STAGE_REQUIRED');

/** The pattern accepts `2026-13-45`; only a round-trip through a real date rejects it. */
export const invalidCalendarDate = (): AppError =>
  new AppError('That is not a real calendar date.', 400, 'INVALID_CALENDAR_DATE');
