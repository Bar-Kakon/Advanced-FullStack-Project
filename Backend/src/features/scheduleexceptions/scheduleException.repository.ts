import { Types } from 'mongoose';

import {
  ScheduleExceptionModel,
  type ExceptionHistoryEntry,
  type ExceptionStatus,
  type ScheduleExceptionRecord,
} from './scheduleException.model.js';

export interface NewScheduleException {
  readonly project: Types.ObjectId;
  readonly kind: ScheduleExceptionRecord['kind'];
  readonly scope: ScheduleExceptionRecord['scope'];
  readonly task?: Types.ObjectId;
  readonly professional?: Types.ObjectId;
  readonly fromDate: Date;
  readonly toDate: Date;
  readonly reason?: string;
  readonly requestedBy: Types.ObjectId;
}

export interface ScheduleExceptionRepository {
  create(input: NewScheduleException): Promise<ScheduleExceptionRecord>;
  findById(id: string): Promise<ScheduleExceptionRecord | null>;
  listForProject(
    project: Types.ObjectId,
    status?: ExceptionStatus,
  ): Promise<ScheduleExceptionRecord[]>;
  /** Every approved row of one project. The calendar layer's only read. */
  listApproved(project: Types.ObjectId): Promise<ScheduleExceptionRecord[]>;
  listApprovedForProjects(projects: readonly Types.ObjectId[]): Promise<ScheduleExceptionRecord[]>;
  appendHistory(id: Types.ObjectId, entry: ExceptionHistoryEntry): Promise<void>;
  update(
    id: Types.ObjectId,
    patch: Partial<
      Pick<
        ScheduleExceptionRecord,
        | 'kind'
        | 'fromDate'
        | 'toDate'
        | 'reason'
        | 'status'
        | 'approvedBy'
        | 'approvedAt'
        | 'rejectedBy'
        | 'rejectedAt'
        | 'decisionNote'
        | 'cancelledAt'
      >
    >,
    entry: ExceptionHistoryEntry,
  ): Promise<ScheduleExceptionRecord | null>;
}

export const scheduleExceptionRepository: ScheduleExceptionRepository = {
  async create(input) {
    const created = new ScheduleExceptionModel({
      ...input,
      requestedAt: new Date(),
      status: 'requested',
      history: [
        {
          action: 'requested',
          by: input.requestedBy,
          at: new Date(),
          fromDate: input.fromDate,
          toDate: input.toDate,
          kind: input.kind,
          ...(input.reason === undefined ? {} : { note: input.reason }),
        },
      ],
    });
    await created.save();
    return created.toObject() as ScheduleExceptionRecord;
  },

  async findById(id) {
    if (!Types.ObjectId.isValid(id)) return null;
    return ScheduleExceptionModel.findById(id).lean<ScheduleExceptionRecord>().exec();
  },

  async listForProject(project, status) {
    return ScheduleExceptionModel.find({ project, ...(status === undefined ? {} : { status }) })
      .sort({ requestedAt: -1 })
      .lean<ScheduleExceptionRecord[]>()
      .exec();
  },

  async listApproved(project) {
    return ScheduleExceptionModel.find({ project, status: 'approved' })
      .sort({ fromDate: 1 })
      .lean<ScheduleExceptionRecord[]>()
      .exec();
  },

  async listApprovedForProjects(projects) {
    if (projects.length === 0) return [];
    return ScheduleExceptionModel.find({ project: { $in: [...projects] }, status: 'approved' })
      .sort({ fromDate: 1 })
      .lean<ScheduleExceptionRecord[]>()
      .exec();
  },

  async appendHistory(id, entry) {
    await ScheduleExceptionModel.updateOne({ _id: id }, { $push: { history: entry } }).exec();
  },

  /**
   * One write for the change and the line recording it, so a row can never carry a new state with
   * no history entry explaining how it got there.
   */
  async update(id, patch, entry) {
    return ScheduleExceptionModel.findOneAndUpdate(
      { _id: id },
      { $set: patch, $push: { history: entry } },
      { new: true },
    )
      .lean<ScheduleExceptionRecord>()
      .exec();
  },
};
