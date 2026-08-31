import { Types } from 'mongoose';

import type { UserRepository } from '../users/user.repository.js';
import { cannotReportSelf, duplicateOpenReport, reportSubjectNotFound } from './report.errors.js';
import type { ReportReceiptDto } from './report.dto.js';
import { toReportReceipt } from './report.dto.js';
import type { ReportReason, ReportSource } from './report.model.js';
import type { ReportRepository } from './report.repository.js';

export interface SubmitUserReportInput {
  readonly reason: ReportReason;
  readonly note?: string;
  readonly source?: ReportSource;
}

export interface ReportsService {
  submitUserReport(
    reporterId: string,
    subjectUserId: string,
    input: SubmitUserReportInput,
  ): Promise<ReportReceiptDto>;
}

export interface ReportsDependencies {
  readonly reports: ReportRepository;
  readonly users: UserRepository;
}

export const createReportsService = ({ reports, users }: ReportsDependencies): ReportsService => ({
  /**
   * Reachability is the profile rule, not a rule of its own: a report may be filed about anyone
   * whose account the reporter can name, which is exactly who Browse and the public profile let
   * them reach. A deactivated or already-restricted account stays reportable, because conduct
   * does not stop being reviewable the moment an account changes state.
   */
  async submitUserReport(reporterId, subjectUserId, { reason, note, source }) {
    if (reporterId === subjectUserId) throw cannotReportSelf();

    // A malformed or unknown id is the same answer, so no id can be probed for existence.
    const subject = await users.findModerationSubject(subjectUserId);
    if (subject === null) throw reportSubjectNotFound();

    const created = await reports.create({
      reporter: new Types.ObjectId(reporterId),
      subjectType: 'user',
      subjectId: subject.id,
      reason,
      ...(note === undefined ? {} : { note }),
      ...(source === undefined ? {} : { source }),
    });

    // The unique partial index refused a second open report for this reporter, subject and reason.
    if (created === null) throw duplicateOpenReport();

    return toReportReceipt(created);
  },
});
