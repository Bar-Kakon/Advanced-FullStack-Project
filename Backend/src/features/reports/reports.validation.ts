import Joi from 'joi';

import { REPORT_REASONS, REPORT_SOURCES, type ReportReason, type ReportSource } from './report.model.js';

export interface ReportUserParams {
  readonly userId: string;
}

export const reportUserParamsSchema = Joi.object({
  userId: Joi.string().hex().length(24).required(),
});

/**
 * The whole of what a reporter may send. `status`, `resolutionNote`, `reviewedBy`, `history` and
 * `reporter` are absent by design and `stripUnknown` removes them, so a crafted body cannot open a
 * report already marked resolved, or plant text in a field only moderation writes.
 */
export const submitReportBodySchema = Joi.object({
  reason: Joi.string()
    .valid(...REPORT_REASONS)
    .required(),
  note: Joi.string().trim().max(1000).optional(),
  source: Joi.string()
    .valid(...REPORT_SOURCES)
    .optional(),
});

export interface SubmitReportBody {
  readonly reason: ReportReason;
  readonly note?: string;
  readonly source?: ReportSource;
}
