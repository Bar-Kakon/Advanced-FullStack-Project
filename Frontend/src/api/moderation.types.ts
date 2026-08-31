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
