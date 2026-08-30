import { AppError } from '../../shared/errors.js';

export const proposalNotFound = (): AppError =>
  new AppError('Proposal is not available', 404, 'PROPOSAL_NOT_FOUND');

export const notPermittedToManageSchedule = (): AppError =>
  new AppError('Not permitted to manage schedule changes here', 403, 'SCHEDULE_NOT_PERMITTED');

export const notPermittedToRequest = (): AppError =>
  new AppError('Not permitted to request a change on this work', 403, 'REQUEST_NOT_PERMITTED');

export const proposalNotOpen = (): AppError =>
  new AppError('That proposal is not open for this action', 409, 'PROPOSAL_NOT_OPEN');

export const alreadyAnswered = (): AppError =>
  new AppError('That response has already been recorded', 409, 'PROPOSAL_ALREADY_ANSWERED');

export const notARespondent = (): AppError =>
  new AppError('That work is not yours to answer for', 403, 'PROPOSAL_NOT_RESPONDENT');

export const counterNeedsDates = (): AppError =>
  new AppError('A counter must name the dates it offers', 400, 'PROPOSAL_COUNTER_INCOMPLETE');

export const changeIsEmpty = (): AppError =>
  new AppError('A request must ask for at least one change', 400, 'PROPOSAL_CHANGE_EMPTY');

export const beyondProjectCeiling = (date: string, ceiling: string): AppError =>
  new AppError(
    `The change would place work on ${date}, past the project ceiling of ${ceiling}`,
    409,
    'PROJECT_CEILING_EXCEEDED',
  );

export const calendarHasNoWorkingDays = (): AppError =>
  new AppError('The project calendar names no working day', 409, 'CALENDAR_NO_WORKING_DAYS');

export const releaseNeedsTasks = (): AppError =>
  new AppError('A partial release must name the work it releases', 400, 'RELEASE_NEEDS_TASKS');
