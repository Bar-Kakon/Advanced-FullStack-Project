/** Both directions: a working day that will not be worked, and a rest day that will be. */
export type ExceptionKind = 'non_working' | 'working';
export type ExceptionScope = 'project' | 'task' | 'professional';
export type ExceptionStatus = 'requested' | 'approved' | 'rejected' | 'cancelled';
export type ExceptionAction = 'requested' | 'modified' | 'approved' | 'rejected' | 'cancelled';

export interface ExceptionHistoryEntry {
  readonly action: ExceptionAction;
  readonly byName: string;
  readonly at: string;
  readonly note: string | null;
  readonly fromDate: string | null;
  readonly toDate: string | null;
  readonly kind: ExceptionKind | null;
}

export interface ScheduleException {
  readonly id: string;
  readonly projectId: string;
  readonly kind: ExceptionKind;
  readonly scope: ExceptionScope;
  readonly taskId: string | null;
  readonly taskTitle: string | null;
  readonly professionalId: string | null;
  readonly professionalName: string | null;
  readonly fromDate: string;
  readonly toDate: string;
  readonly reason: string | null;
  readonly status: ExceptionStatus;
  readonly requestedByName: string;
  readonly requestedAt: string;
  readonly decidedByName: string | null;
  readonly decidedAt: string | null;
  readonly decisionNote: string | null;
  /** Travels with the request: a change the approver made has to be visible to the submitter. */
  readonly history: readonly ExceptionHistoryEntry[];
  readonly canApprove: boolean;
  readonly canModify: boolean;
  readonly canCancel: boolean;
}

/** Only the days an approved exception actually overrides. Never a generated holiday table. */
export interface EffectiveDay {
  readonly date: string;
  readonly working: boolean;
}

export interface ScheduleExceptionList {
  readonly exceptions: readonly ScheduleException[];
  readonly mayApprove: boolean;
  readonly effectiveDays: readonly EffectiveDay[];
}
