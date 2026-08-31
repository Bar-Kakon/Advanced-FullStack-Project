import Joi from 'joi';

import { REPORT_STATUSES, type ReportStatus } from '../reports/report.model.js';

export interface ReportIdParams {
  readonly reportId: string;
}

export const reportIdParamsSchema = Joi.object({
  reportId: Joi.string().hex().length(24).required(),
});

export interface QueueQueryInput {
  readonly status?: ReportStatus;
  readonly limit: number;
  readonly before?: Date;
}

export const queueQuerySchema = Joi.object({
  status: Joi.string()
    .valid(...REPORT_STATUSES)
    .optional(),
  limit: Joi.number().integer().min(1).max(50).default(20),
  before: Joi.date().iso().optional(),
});

export interface ResolveBody {
  readonly outcome: 'dismissed' | 'actioned';
  readonly note?: string;
}

/**
 * `reviewedBy` is deliberately not a field. The moderator is read from the authenticated session,
 * so no payload can record the action against a colleague.
 */
export const resolveBodySchema = Joi.object({
  outcome: Joi.string().valid('dismissed', 'actioned').required(),
  note: Joi.string().trim().max(2000).optional(),
});

export interface AccountActionBody {
  readonly action: 'restrict' | 'unrestrict';
  readonly reason: string;
}

/** The ban sheet makes the reason required, so the schema does too — an empty string will not pass. */
export const accountActionBodySchema = Joi.object({
  action: Joi.string().valid('restrict', 'unrestrict').required(),
  reason: Joi.string().trim().min(1).max(2000).required(),
});
