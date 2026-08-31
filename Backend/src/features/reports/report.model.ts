import { Schema, model, type Types } from 'mongoose';

/**
 * The four codes `docs/database-design.html` names for `reports.reason`. They are storage codes,
 * never labels: the client renders its own wording per language.
 */
export const REPORT_REASONS = ['spam', 'harassment', 'impersonation', 'other'] as const;
export type ReportReason = (typeof REPORT_REASONS)[number];

/**
 * Leaf-only and polymorphic, the same pattern as `mutes`. Only `user` is filed today; a later
 * subject type is one enum member and one resolver, never a second collection.
 */
export const REPORT_SUBJECT_TYPES = ['user'] as const;
export type ReportSubjectType = (typeof REPORT_SUBJECT_TYPES)[number];

/** Where the reporter filed from. Context for moderation, never a permission. */
export const REPORT_SOURCES = ['public_profile'] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number];

export const REPORT_STATUSES = ['open', 'under_review', 'dismissed', 'actioned'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const REPORT_HISTORY_ACTIONS = [
  'report.submitted',
  'report.claimed',
  'report.dismissed',
  'report.actioned',
  'account.restricted',
  'account.unrestricted',
] as const;
export type ReportHistoryAction = (typeof REPORT_HISTORY_ACTIONS)[number];

/** One appended moderation event. Internal: no ordinary-user projection carries it. */
export interface ReportHistoryEntry {
  readonly action: ReportHistoryAction;
  readonly actor: Types.ObjectId;
  readonly note?: string;
  readonly at: Date;
}

export interface ReportRecord {
  readonly _id: Types.ObjectId;
  readonly reporter: Types.ObjectId;
  readonly subject: { readonly type: ReportSubjectType; readonly id: Types.ObjectId };
  readonly reason: ReportReason;
  readonly note?: string;
  readonly noteRedactedAt?: Date;
  readonly source?: ReportSource;
  readonly status: ReportStatus;
  readonly open?: true;
  readonly history: readonly ReportHistoryEntry[];
  readonly reviewedBy?: Types.ObjectId;
  readonly resolvedAt?: Date;
  readonly resolutionNote?: string;
  readonly createdAt: Date;
}

const historyEntrySchema = new Schema(
  {
    action: { type: String, enum: REPORT_HISTORY_ACTIONS, required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    note: { type: String, trim: true, maxlength: 2000 },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { _id: false },
);

const reportSchema = new Schema(
  {
    reporter: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },

    // Identifiers only. Nothing here copies a name or an email, so anonymising the account under
    // D8 neutralises every report about it with no backfill and no forever-copy to find.
    subject: {
      type: { type: String, enum: REPORT_SUBJECT_TYPES, required: true },
      id: { type: Schema.Types.ObjectId, required: true },
    },

    reason: { type: String, enum: REPORT_REASONS, required: true },

    // The reporter's own words, and the one field on this document that carries free personal
    // text. `noteRedactedAt` records that D8 neutralised it, keeping the report itself readable.
    note: { type: String, trim: true, maxlength: 1000 },
    noteRedactedAt: { type: Date },

    source: { type: String, enum: REPORT_SOURCES },

    status: { type: String, enum: REPORT_STATUSES, default: 'open', required: true, index: true },

    // Exists only while the report is unresolved, and exists for no other reason: a partial index
    // may filter on a value being present but not on its absence, so the duplicate rule needs
    // something positive to match. Resolution unsets it; `status` and `resolvedAt` stay the
    // readable record of what happened.
    open: { type: Boolean },

    // Append-only. A resolution adds an entry; nothing rewrites or removes one.
    history: { type: [historyEntrySchema], required: true, default: [] },

    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },

    // Absent while the report is open, which is what the duplicate index filters on.
    resolvedAt: { type: Date },
    resolutionNote: { type: String, trim: true, maxlength: 2000 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// The moderation queue: the open ones, newest first.
reportSchema.index({ status: 1, createdAt: -1 });

// Every report against one subject, which is how a repeat pattern is one query.
reportSchema.index({ 'subject.type': 1, 'subject.id': 1, createdAt: -1 });

// One open report per reporter, subject and reason. Resolving one unsets `open` and frees the
// slot, so the rule controls duplicate noise without silencing a reporter forever.
reportSchema.index(
  { reporter: 1, 'subject.type': 1, 'subject.id': 1, reason: 1 },
  { unique: true, name: 'open_report_unique', partialFilterExpression: { open: true } },
);

export const ReportModel = model('Report', reportSchema);
