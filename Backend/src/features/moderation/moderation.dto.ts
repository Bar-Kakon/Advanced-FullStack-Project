import type { ModerationSubject } from '../users/user.repository.js';
import type { ReportRecord, ReportSubjectType } from '../reports/report.model.js';

/**
 * A person as moderation sees them. `name` is `null` when the account is gone or anonymised under
 * D8 — nothing here is a stored copy, so the neutral identity appears with no backfill.
 */
export interface ModerationPersonDto {
  readonly id: string;
  readonly name: string | null;
}

export interface ModerationSubjectDto extends ModerationPersonDto {
  readonly email: string | null;
  readonly status: string | null;
}

export interface ModerationHistoryEntryDto {
  readonly action: string;
  readonly actor: ModerationPersonDto;
  readonly note: string | null;
  readonly at: string;
}

export interface ModerationQueueItemDto {
  readonly id: string;
  readonly reason: string;
  readonly status: string;
  readonly createdAt: string;
  readonly subjectType: ReportSubjectType;
  readonly subject: ModerationPersonDto;
  readonly reporter: ModerationPersonDto;
}

export interface ModerationReportDto extends ModerationQueueItemDto {
  /** The reporter's own words, or `null` once D8 has redacted them. */
  readonly note: string | null;
  readonly noteRedacted: boolean;
  readonly source: string | null;
  readonly subjectAccount: ModerationSubjectDto;
  /** How many reports this subject carries in total. A signal, never a verdict. */
  readonly subjectReportCount: number;
  readonly history: readonly ModerationHistoryEntryDto[];
  readonly resolution: {
    readonly resolvedAt: string | null;
    readonly resolvedBy: ModerationPersonDto | null;
    readonly note: string | null;
  };
}

/** Names are looked up per request and never stored on the report. */
export type NameLookup = (id: string) => string | null;

const person = (id: string, names: NameLookup): ModerationPersonDto => ({ id, name: names(id) });

export const toQueueItem = (report: ReportRecord, names: NameLookup): ModerationQueueItemDto => ({
  id: report._id.toString(),
  reason: report.reason,
  status: report.status,
  createdAt: report.createdAt.toISOString(),
  subjectType: report.subject.type,
  subject: person(report.subject.id.toString(), names),
  reporter: person(report.reporter.toString(), names),
});

export const toReportDetail = (
  report: ReportRecord,
  account: ModerationSubject | null,
  subjectReportCount: number,
  names: NameLookup,
): ModerationReportDto => ({
  ...toQueueItem(report, names),
  note: report.note ?? null,
  noteRedacted: report.noteRedactedAt !== undefined,
  source: report.source ?? null,
  subjectAccount: {
    id: report.subject.id.toString(),
    name: account === null ? null : `${account.firstName} ${account.lastName}`.trim(),
    email: account?.email ?? null,
    status: account?.status ?? null,
  },
  subjectReportCount,
  history: report.history.map((entry) => ({
    action: entry.action,
    actor: person(entry.actor.toString(), names),
    note: entry.note ?? null,
    at: entry.at.toISOString(),
  })),
  resolution: {
    resolvedAt: report.resolvedAt?.toISOString() ?? null,
    resolvedBy: report.reviewedBy === undefined ? null : person(report.reviewedBy.toString(), names),
    note: report.resolutionNote ?? null,
  },
});
