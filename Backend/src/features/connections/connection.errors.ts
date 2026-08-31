import { AppError } from '../../shared/errors.js';

/** Connecting to yourself is not a state this model has. */
export const cannotConnectToSelf = (): AppError =>
  new AppError('You cannot connect to yourself', 400, 'CANNOT_CONNECT_TO_SELF');

/** An edge already exists for this pair, in either direction and any status. */
export const connectionAlreadyExists = (): AppError =>
  new AppError('A connection already exists with that person', 409, 'CONNECTION_ALREADY_EXISTS');

/** The person named does not exist. */
export const connectionTargetNotFound = (): AppError =>
  new AppError('No such user', 404, 'USER_NOT_FOUND');

/** Blocking hides a person entirely, so no request may be opened toward them. */
export const connectionBlocked = (): AppError =>
  new AppError('That person is not available', 404, 'USER_NOT_FOUND');

/** Nothing pending for this caller to answer. */
export const noPendingRequest = (): AppError =>
  new AppError('No pending request to answer', 404, 'CONNECTION_REQUEST_NOT_FOUND');

/** There is no live connection between these two to end. */
export const notConnected = (): AppError =>
  new AppError('You are not connected to that person', 404, 'NOT_CONNECTED');
