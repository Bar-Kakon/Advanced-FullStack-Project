import type {
  ExceptionAction,
  ExceptionKind,
  ExceptionScope,
  ExceptionStatus,
} from './scheduleException.model.js';

export interface ExceptionHistoryDto {
  readonly action: ExceptionAction;
  readonly byName: string;
  readonly at: string;
  readonly note: string | null;
  readonly fromDate: string | null;
  readonly toDate: string | null;
  readonly kind: ExceptionKind | null;
}

/**
 * One request as a viewer sees it.
 *
 * The history travels with the request, which is the closed routing rule: a professional whose
 * request the approver changed has to be able to see what changed before confirming it.
 */
export interface ScheduleExceptionDto {
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
  readonly history: readonly ExceptionHistoryDto[];
  /** What this viewer may actually do, so no control is offered the API would refuse. */
  readonly canApprove: boolean;
  readonly canModify: boolean;
  readonly canCancel: boolean;
}

export interface ScheduleExceptionListDto {
  readonly exceptions: readonly ScheduleExceptionDto[];
  /** Whether this viewer holds `schedule.exception.approve` on the project. */
  readonly mayApprove: boolean;
  /** The approved rows a calendar view draws, already resolved for this viewer's own work. */
  readonly effectiveDays: readonly EffectiveDayDto[];
}

export interface EffectiveDayDto {
  readonly date: string;
  readonly working: boolean;
}
