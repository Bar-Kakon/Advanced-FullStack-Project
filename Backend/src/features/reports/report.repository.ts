import { Types } from 'mongoose';

import {
  ReportModel,
  type ReportHistoryAction,
  type ReportReason,
  type ReportRecord,
  type ReportSource,
  type ReportStatus,
  type ReportSubjectType,
} from './report.model.js';

export interface NewReport {
  readonly reporter: Types.ObjectId;
  readonly subjectType: ReportSubjectType;
  readonly subjectId: Types.ObjectId;
  readonly reason: ReportReason;
  readonly note?: string;
  readonly source?: ReportSource;
}

export interface QueueQuery {
  readonly status?: ReportStatus;
  readonly limit: number;
  readonly before?: Date;
}

export interface ResolutionInput {
  readonly reportId: Types.ObjectId;
  readonly moderator: Types.ObjectId;
  readonly status: Extract<ReportStatus, 'dismissed' | 'actioned'>;
  readonly resolutionNote?: string;
}

export interface ReportRepository {
  /** `null` when this reporter already has the same report open against the same subject. */
  create(report: NewReport): Promise<ReportRecord | null>;
  findById(id: string): Promise<ReportRecord | null>;
  queue(query: QueueQuery): Promise<ReportRecord[]>;
  /** Every report filed against one subject, which is how a repeat pattern is read. */
  listForSubject(type: ReportSubjectType, id: Types.ObjectId, limit: number): Promise<ReportRecord[]>;
  claim(reportId: Types.ObjectId, moderator: Types.ObjectId): Promise<ReportRecord | null>;
  resolve(input: ResolutionInput): Promise<ReportRecord | null>;
  appendHistory(
    reportId: Types.ObjectId,
    entry: { action: ReportHistoryAction; actor: Types.ObjectId; note?: string },
  ): Promise<ReportRecord | null>;
  /** D8: drop the reporter's free text, keep the report and its moderation history. */
  redactNotesByReporter(reporter: Types.ObjectId): Promise<number>;
}

const DUPLICATE_KEY_CODE = 11000;

export const reportRepository: ReportRepository = {
  async create({ reporter, subjectType, subjectId, reason, note, source }) {
    try {
      const [created] = await ReportModel.create([
        {
          reporter,
          subject: { type: subjectType, id: subjectId },
          reason,
          ...(note === undefined ? {} : { note }),
          ...(source === undefined ? {} : { source }),
          status: 'open',
          open: true,
          history: [{ action: 'report.submitted', actor: reporter, at: new Date() }],
        },
      ]);
      return created === undefined ? null : (created.toObject() as ReportRecord);
    } catch (error) {
      // The partial unique index is what refuses a second open report, so the rule is enforced by
      // the database rather than by a read-then-write that two requests could interleave through.
      if ((error as { code?: number }).code === DUPLICATE_KEY_CODE) return null;
      throw error;
    }
  },

  async findById(id) {
    if (!Types.ObjectId.isValid(id)) return null;
    return ReportModel.findById(id).lean<ReportRecord>().exec();
  },

  async queue({ status, limit, before }) {
    return ReportModel.find({
      ...(status === undefined ? {} : { status }),
      ...(before === undefined ? {} : { createdAt: { $lt: before } }),
    })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<ReportRecord[]>()
      .exec();
  },

  async listForSubject(type, id, limit) {
    return ReportModel.find({ 'subject.type': type, 'subject.id': id })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<ReportRecord[]>()
      .exec();
  },

  /**
   * Only an open report may be claimed, and the filter says so, so two moderators opening the
   * queue at the same moment cannot both take it.
   */
  async claim(reportId, moderator) {
    return ReportModel.findOneAndUpdate(
      { _id: reportId, status: 'open' },
      {
        $set: { status: 'under_review', reviewedBy: moderator },
        $push: { history: { action: 'report.claimed', actor: moderator, at: new Date() } },
      },
      { returnDocument: 'after' },
    )
      .lean<ReportRecord>()
      .exec();
  },

  /**
   * The filter requires the report to still be open, so a resolution can only ever apply once.
   * A second moderator gets `null` and the caller answers 409 rather than overwriting a verdict.
   * The verdict is appended to `history` in the same update, so no resolution can lose its trail.
   */
  async resolve({ reportId, moderator, status, resolutionNote }) {
    const at = new Date();

    return ReportModel.findOneAndUpdate(
      { _id: reportId, open: true },
      {
        $set: {
          status,
          reviewedBy: moderator,
          resolvedAt: at,
          ...(resolutionNote === undefined ? {} : { resolutionNote }),
        },
        // Leaving the partial index frees the reporter to raise the same concern again later.
        $unset: { open: '' },
        $push: {
          history: {
            action: status === 'dismissed' ? 'report.dismissed' : 'report.actioned',
            actor: moderator,
            ...(resolutionNote === undefined ? {} : { note: resolutionNote }),
            at,
          },
        },
      },
      { returnDocument: 'after' },
    )
      .lean<ReportRecord>()
      .exec();
  },

  async appendHistory(reportId, { action, actor, note }) {
    return ReportModel.findOneAndUpdate(
      { _id: reportId },
      {
        $push: {
          history: { action, actor, ...(note === undefined ? {} : { note }), at: new Date() },
        },
      },
      { returnDocument: 'after' },
    )
      .lean<ReportRecord>()
      .exec();
  },

  /**
   * The one field on a report that carries free personal text. Clearing it leaves the reporter
   * reference, the reason, the status and the whole moderation history intact — business and
   * moderation history survives while the PII does not.
   */
  async redactNotesByReporter(reporter) {
    const result = await ReportModel.updateMany(
      { reporter, note: { $exists: true } },
      { $unset: { note: '' }, $set: { noteRedactedAt: new Date() } },
    ).exec();

    return result.modifiedCount;
  },
};