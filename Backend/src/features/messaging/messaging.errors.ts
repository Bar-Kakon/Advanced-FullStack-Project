import { AppError } from '../../shared/errors.js';

/**
 * A conversation the viewer may not read answers exactly as one that is not there, so probing an
 * id can never confirm that a thread between two other people exists.
 */
export const conversationNotFound = (): AppError =>
  new AppError('Conversation not found.', 404, 'CONVERSATION_NOT_FOUND');

export const messageNotFound = (): AppError =>
  new AppError('Message not found.', 404, 'MESSAGE_NOT_FOUND');

export const cannotMessageSelf = (): AppError =>
  new AppError('You cannot open a conversation with yourself.', 400, 'CANNOT_MESSAGE_SELF');

/** No-contact applies to private messages only. It never reaches a shared Project Room. */
export const noContactWithUser = (): AppError =>
  new AppError('This conversation is not available.', 403, 'NO_CONTACT');

export const requestNotPending = (): AppError =>
  new AppError('That message request is not open.', 409, 'MESSAGE_REQUEST_NOT_PENDING');

export const requestNotYours = (): AppError =>
  new AppError('Only the recipient may answer a message request.', 403, 'MESSAGE_REQUEST_NOT_YOURS');

/** Until a request is accepted the sender may not keep writing into it. */
export const requestAwaitingResponse = (): AppError =>
  new AppError('Wait for this request to be accepted.', 409, 'MESSAGE_REQUEST_AWAITING_RESPONSE');

export const agreementNotPending = (): AppError =>
  new AppError('That agreement has already been answered.', 409, 'AGREEMENT_NOT_PENDING');

export const cannotAnswerOwnAgreement = (): AppError =>
  new AppError('The other party answers an agreement.', 403, 'CANNOT_ANSWER_OWN_AGREEMENT');

/** The guarantee behind "exactly once": an accepted agreement already holds its task. */
export const agreementAlreadyBecameTask = (): AppError =>
  new AppError('That agreement has already created its task.', 409, 'AGREEMENT_ALREADY_TASK');

export const projectRoomForbidden = (): AppError =>
  new AppError('Conversation not found.', 404, 'CONVERSATION_NOT_FOUND');
