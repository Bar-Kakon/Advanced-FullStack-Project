import type { ReportRecord } from './report.model.js';

/**
 * Everything a reporter is told, and it is deliberately almost nothing: the report exists and when
 * it was filed. No status, no reason echoed back, no subject, no moderator and no history — the
 * approved rule is that submission is an acknowledgement, not a window into review.
 */
export interface ReportReceiptDto {
  readonly id: string;
  readonly createdAt: string;
}

export const toReportReceipt = (report: ReportRecord): ReportReceiptDto => ({
  id: report._id.toString(),
  createdAt: report.createdAt.toISOString(),
});