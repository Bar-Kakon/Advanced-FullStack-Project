/** The four storage codes the API accepts. The UI never renders one — it renders its own wording. */
export const REPORT_REASONS = ['spam', 'harassment', 'impersonation', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

export type ReportSource = 'public_profile';

export interface SubmitReportPayload {
  readonly reason: ReportReason;
  readonly note?: string;
  readonly source?: ReportSource;
}

/** Everything the reporter is told back: the report exists, and when. Nothing about review. */
export interface ReportReceipt {
  readonly id: string;
  readonly createdAt: string;
}

export interface SubmitReportResponse {
  readonly report: ReportReceipt;
}

/** The submission failures the dialog answers individually. */
export type SubmitReportFailure =
  | 'CANNOT_REPORT_SELF'
  | 'DUPLICATE_OPEN_REPORT'
  | 'TOO_MANY_REQUESTS'
  | 'NOT_FOUND'
  | 'NETWORK'
  | 'UNKNOWN';