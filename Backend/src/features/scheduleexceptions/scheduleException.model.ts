import { Schema, model, type Types } from 'mongoose';

/**
 * One request to change whether a named stretch of dates is worked, and the decision on it.
 *
 * The weekly pattern and the project overrides answer what a normal week looks like. This answers
 * the dates that are not normal, in both directions, and it is the only place a one-off date lives.
 * Nothing here is derived from a holiday table: no approved data source exists, so every row is
 * something a person asked for and somebody with the authority approved.
 */
export const EXCEPTION_KINDS = ['non_working', 'working'] as const;
export type ExceptionKind = (typeof EXCEPTION_KINDS)[number];

/** What the request covers, per the closed coverage rule. */
export const EXCEPTION_SCOPES = ['project', 'task', 'professional'] as const;
export type ExceptionScope = (typeof EXCEPTION_SCOPES)[number];

export const EXCEPTION_STATUSES = ['requested', 'approved', 'rejected', 'cancelled'] as const;
export type ExceptionStatus = (typeof EXCEPTION_STATUSES)[number];

export const EXCEPTION_ACTIONS = [
  'requested',
  'modified',
  'approved',
  'rejected',
  'cancelled',
] as const;
export type ExceptionAction = (typeof EXCEPTION_ACTIONS)[number];

/**
 * One line of what happened to this request. Appended to and never rewritten: a modification made
 * by the approver has to remain visible to the professional it routes back through, and an
 * approval that ended the matter has to stay provable afterwards.
 */
export interface ExceptionHistoryEntry {
  readonly action: ExceptionAction;
  readonly by: Types.ObjectId;
  readonly at: Date;
  readonly note?: string;
  readonly fromDate?: Date;
  readonly toDate?: Date;
  readonly kind?: ExceptionKind;
}

export interface ScheduleExceptionRecord {
  readonly _id: Types.ObjectId;
  readonly project: Types.ObjectId;
  readonly kind: ExceptionKind;
  readonly scope: ExceptionScope;
  /** Present only on a `task` request, and required there. */
  readonly task?: Types.ObjectId;
  /** Whose work the request is about. A professional may only ever name themself. */
  readonly professional?: Types.ObjectId;
  /** The first and last date covered. A single date stores the same value in both. */
  readonly fromDate: Date;
  readonly toDate: Date;
  readonly reason?: string;
  readonly status: ExceptionStatus;
  readonly requestedBy: Types.ObjectId;
  readonly requestedAt: Date;
  /** Who ended the matter. An authorised approval is final and is never forwarded again. */
  readonly approvedBy?: Types.ObjectId;
  readonly approvedAt?: Date;
  readonly rejectedBy?: Types.ObjectId;
  readonly rejectedAt?: Date;
  readonly decisionNote?: string;
  readonly cancelledAt?: Date;
  readonly history: readonly ExceptionHistoryEntry[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const historySchema = new Schema(
  {
    action: { type: String, enum: EXCEPTION_ACTIONS, required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    at: { type: Date, required: true },
    note: { type: String, trim: true, maxlength: 600 },
    fromDate: { type: Date },
    toDate: { type: Date },
    kind: { type: String, enum: EXCEPTION_KINDS },
  },
  { _id: false },
);

const scheduleExceptionSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    kind: { type: String, enum: EXCEPTION_KINDS, required: true },
    scope: { type: String, enum: EXCEPTION_SCOPES, required: true },
    task: { type: Schema.Types.ObjectId, ref: 'Task' },
    professional: { type: Schema.Types.ObjectId, ref: 'User' },

    fromDate: { type: Date, required: true },
    toDate: { type: Date, required: true },
    reason: { type: String, trim: true, maxlength: 600 },

    status: { type: String, enum: EXCEPTION_STATUSES, required: true, default: 'requested' },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    requestedAt: { type: Date, required: true },

    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedAt: { type: Date },
    rejectedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    rejectedAt: { type: Date },
    decisionNote: { type: String, trim: true, maxlength: 600 },
    cancelledAt: { type: Date },

    history: { type: [historySchema], default: [] },
  },
  { timestamps: true },
);

// The scope and the document it points at must never describe two different things.
scheduleExceptionSchema.pre('validate', function preValidate() {
  const scope = this.get('scope') as ExceptionScope;
  const task = this.get('task') as Types.ObjectId | undefined;
  const professional = this.get('professional') as Types.ObjectId | undefined;

  if (scope === 'task' && !task) throw new Error('A task exception must name its task.');
  if (scope !== 'task' && task) throw new Error('Only a task exception may name a task.');
  if (scope === 'professional' && !professional) {
    throw new Error('A professional exception must name the professional.');
  }
  if ((this.get('toDate') as Date) < (this.get('fromDate') as Date)) {
    throw new Error('An exception cannot end before it starts.');
  }
});

// The calendar read: every approved row of one project covering a window.
scheduleExceptionSchema.index({ project: 1, status: 1, fromDate: 1, toDate: 1 });
// The queue an approver works from, newest first.
scheduleExceptionSchema.index({ project: 1, status: 1, requestedAt: -1 });

export const ScheduleExceptionModel = model('ScheduleException', scheduleExceptionSchema);
