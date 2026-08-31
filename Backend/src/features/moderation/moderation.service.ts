import { Types } from 'mongoose';

import type { ModerationSubject, UserRepository } from '../users/user.repository.js';
import type { ReportRecord, ReportStatus } from '../reports/report.model.js';
import type { ReportRepository } from '../reports/report.repository.js';
import {
  accountActionNotApplicable,
  moderationResourceNotFound,
  reportAlreadyResolved,
} from './moderation.errors.js';
import {
  toQueueItem,
  toReportDetail,
  type ModerationQueueItemDto,
  type ModerationReportDto,
  type NameLookup,
} from './moderation.dto.js';

/** Restriction is the one account action the ban sheet approves outright. */
export type AccountAction = 'restrict' | 'unrestrict';

export interface QueueOptions {
  readonly status?: ReportStatus;
  readonly limit: number;
  readonly before?: Date;
}

export interface ResolveInput {
  readonly outcome: Extract<ReportStatus, 'dismissed' | 'actioned'>;
  readonly note?: string;
}

export interface ModerationService {
  queue(options: QueueOptions): Promise<ModerationQueueItemDto[]>;
  detail(reportId: string): Promise<ModerationReportDto>;
  claim(reportId: string, moderatorId: string): Promise<ModerationReportDto>;
  resolve(reportId: string, moderatorId: string, input: ResolveInput): Promise<ModerationReportDto>;
  applyAccountAction(
    reportId: string,
    moderatorId: string,
    action: AccountAction,
    reason: string,
  ): Promise<ModerationReportDto>;
}

export interface ModerationDependencies {
  readonly reports: ReportRepository;
  readonly users: UserRepository;
}

const SUBJECT_HISTORY_LIMIT = 50;

export const createModerationService = ({
  reports,
  users,
}: ModerationDependencies): ModerationService => {
  /** One batched name query per response, so a queue page is two reads rather than 2N. */
  const namesFor = async (rows: readonly ReportRecord[]): Promise<NameLookup> => {
    const ids = new Map<string, Types.ObjectId>();
    for (const row of rows) {
      ids.set(row.reporter.toString(), row.reporter);
      ids.set(row.subject.id.toString(), row.subject.id);
      if (row.reviewedBy !== undefined) ids.set(row.reviewedBy.toString(), row.reviewedBy);
      for (const entry of row.history) ids.set(entry.actor.toString(), entry.actor);
    }

    const found = await users.findDisplayNames([...ids.values()]);
    return (id) => found.get(id) ?? null;
  };

  const detailOf = async (report: ReportRecord): Promise<ModerationReportDto> => {
    const [account, siblings, names] = await Promise.all([
      users.findModerationSubject(report.subject.id.toString()),
      reports.listForSubject(report.subject.type, report.subject.id, SUBJECT_HISTORY_LIMIT),
      namesFor([report]),
    ]);

    return toReportDetail(report, account, siblings.length, names);
  };

  const loadReport = async (reportId: string): Promise<ReportRecord> => {
    const report = await reports.findById(reportId);
    // 404 for a malformed id and for a real one alike: neither may confirm the other.
    if (report === null) throw moderationResourceNotFound();
    return report;
  };

  const subjectOf = async (report: ReportRecord): Promise<ModerationSubject> => {
    const account = await users.findModerationSubject(report.subject.id.toString());
    if (account === null) throw accountActionNotApplicable();
    return account;
  };

  return {
    async queue(options) {
      const rows = await reports.queue(options);
      const names = await namesFor(rows);
      return rows.map((row) => toQueueItem(row, names));
    },

    async detail(reportId) {
      return detailOf(await loadReport(reportId));
    },

    /**
     * Taking a report out of the open pile. The repository filter requires it to still be open, so
     * the second of two moderators clicking at once is told the report moved rather than silently
     * replacing the first as its reviewer.
     */
    async claim(reportId, moderatorId) {
      const report = await loadReport(reportId);
      const claimed = await reports.claim(report._id, new Types.ObjectId(moderatorId));
      if (claimed === null) throw reportAlreadyResolved();
      return detailOf(claimed);
    },

    /**
     * The resolution, and the only place a report leaves the queue. Nothing is deleted: the row,
     * its reason, its note and its whole history stay exactly as they were, and the verdict is
     * appended. A report found invalid is `dismissed`, which is a recorded result rather than an
     * erasure.
     */
    async resolve(reportId, moderatorId, { outcome, note }) {
      const report = await loadReport(reportId);

      const resolved = await reports.resolve({
        reportId: report._id,
        moderator: new Types.ObjectId(moderatorId),
        status: outcome,
        ...(note === undefined ? {} : { resolutionNote: note }),
      });

      // Already carries a `resolvedAt`, so a second resolution is refused rather than applied
      // twice — the same verdict submitted twice cannot produce two different histories.
      if (resolved === null) throw reportAlreadyResolved();

      return detailOf(resolved);
    },

    /**
     * The approved account action, and the only one: restriction. It removes discovery, new
     * connections and new projects while every live commitment runs to completion — it is not a
     * lockout, and it never touches a task, a project membership or a work plan.
     *
     * `reason` is required by the ban sheet, and it is written into the report's own history, so
     * the action and the report that produced it are read in one place.
     */
    async applyAccountAction(reportId, moderatorId, action, reason) {
      const report = await loadReport(reportId);
      if (report.subject.type !== 'user') throw accountActionNotApplicable();

      const account = await subjectOf(report);

      // A moderator may not restrict themselves, and platform authority is not moderated here.
      if (account.id.toString() === moderatorId || account.isAdmin) {
        throw accountActionNotApplicable();
      }

      const [from, to] =
        action === 'restrict' ? (['active', 'restricted'] as const) : (['restricted', 'active'] as const);

      // Filtered on the status being left, so two moderators cannot both believe they applied it.
      if (!(await users.transitionStatus(account.id, from, to))) throw accountActionNotApplicable();

      const updated = await reports.appendHistory(report._id, {
        action: action === 'restrict' ? 'account.restricted' : 'account.unrestricted',
        actor: new Types.ObjectId(moderatorId),
        note: reason,
      });

      return detailOf(updated ?? report);
    },
  };
};
