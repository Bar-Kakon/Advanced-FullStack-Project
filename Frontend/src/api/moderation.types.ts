export type ModerationReportStatus = 'open' | 'under_review' | 'dismissed' | 'actioned';

export interface ModerationPerson {
  readonly id: string;
  /** `null` for an account that is gone or anonymised. The screen shows a neutral label. */
  readonly name: string | null;
}

export interface ModerationSubjectAccount extends ModerationPerson {
  readonly email: string | null;
  readonly status: string | null;
}

export interface ModerationHistoryEntry {
  readonly action: string;
  readonly actor: ModerationPerson;
  readonly note: string | null;
  readonly at: string;
}

export interface ModerationQueueItem {
  readonly id: string;
  readonly reason: string;
  readonly status: ModerationReportStatus;
  readonly createdAt: string;
  readonly subjectType: 'user';
  readonly subject: ModerationPerson;
  readonly reporter: ModerationPerson;
}

export interface ModerationReport extends ModerationQueueItem {
  readonly note: string | null;
  readonly noteRedacted: boolean;
  readonly source: string | null;
  readonly subjectAccount: ModerationSubjectAccount;
  readonly subjectReportCount: number;
  readonly history: readonly ModerationHistoryEntry[];
  readonly resolution: {
    readonly resolvedAt: string | null;
    readonly resolvedBy: ModerationPerson | null;
    readonly note: string | null;
  };
}

export interface ModerationQueueResponse {
  readonly reports: readonly ModerationQueueItem[];
}

export interface ModerationReportResponse {
  readonly report: ModerationReport;
}

export type ResolutionOutcome = 'dismissed' | 'actioned';
export type AccountAction = 'restrict' | 'unrestrict';

export const PLATFORM_AUDIT_ACTIONS = [
  'report.claimed',
  'report.dismissed',
  'report.actioned',
  'report.note_redacted',
  'account.restricted',
  'account.unrestricted',
  'account.deleted',
  'account.restored',
] as const;
export type PlatformAuditAction = (typeof PLATFORM_AUDIT_ACTIONS)[number];

export const PLATFORM_AUDIT_TARGET_TYPES = ['report', 'user'] as const;
export type PlatformAuditTargetType = (typeof PLATFORM_AUDIT_TARGET_TYPES)[number];

export interface PlatformAuditRow {
  readonly id: string;
  readonly action: PlatformAuditAction;
  readonly actor: { readonly userId: string; readonly name: string | null };
  readonly targetType: PlatformAuditTargetType;
  readonly targetId: string;
  readonly metadata: Record<string, unknown>;
  readonly at: string;
}

export interface PlatformAuditPageResponse {
  readonly rows: readonly PlatformAuditRow[];
  readonly nextCursor: string | null;
}
