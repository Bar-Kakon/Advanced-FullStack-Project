import Joi from 'joi';

const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;
const OBJECT_ID = Joi.string().hex().length(24);

export const conversationIdParamsSchema = Joi.object({
  conversationId: OBJECT_ID.required(),
});

export const messageIdParamsSchema = Joi.object({
  conversationId: OBJECT_ID.required(),
  messageId: OBJECT_ID.required(),
});

export const userIdParamsSchema = Joi.object({ userId: OBJECT_ID.required() });

export const projectIdParamsSchema = Joi.object({ projectId: OBJECT_ID.required() });

export interface InboxQueryInput {
  readonly folder: 'inbox' | 'requests';
  readonly limit: number;
  readonly cursor?: string;
}

/** Hidden conversations are simply absent; there is no folder that lists them back. */
export const inboxQuerySchema = Joi.object({
  folder: Joi.string().valid('inbox', 'requests').default('inbox'),
  limit: Joi.number().integer().min(1).max(50).default(20),
  cursor: Joi.string().max(120).optional(),
});

export interface HistoryQueryInput {
  readonly limit: number;
  readonly cursor?: string;
}

export const historyQuerySchema = Joi.object({
  limit: Joi.number().integer().min(1).max(50).default(30),
  cursor: Joi.string().max(120).optional(),
});

export interface SendMessageBody {
  readonly body: string;
}

export const sendMessageBodySchema = Joi.object({
  body: Joi.string().trim().min(1).max(4000).required(),
});

export interface StartDirectBody {
  readonly body: string;
}

export const startDirectBodySchema = Joi.object({
  body: Joi.string().trim().min(1).max(4000).required(),
});

export interface AgreementBody {
  readonly title: string;
  readonly description?: string;
  readonly startDate: string;
  readonly dueDate: string;
  readonly projectId?: string;
}

/**
 * The Create Task fields, and only those. There is no assignee field: the agreement's two parties
 * are the conversation's, so naming one would let a payload assign work to somebody else.
 */
export const agreementBodySchema = Joi.object({
  title: Joi.string().trim().min(1).max(200).required(),
  description: Joi.string().trim().max(2000).optional(),
  startDate: Joi.string().trim().pattern(CALENDAR_DATE).required(),
  dueDate: Joi.string().trim().pattern(CALENDAR_DATE).required(),
  projectId: OBJECT_ID.optional(),
});

export interface ReportMessageBody {
  readonly reason: string;
  readonly note?: string;
}

export const reportMessageBodySchema = Joi.object({
  reason: Joi.string().valid('spam', 'harassment', 'impersonation', 'other').required(),
  note: Joi.string().trim().max(1000).optional(),
});
