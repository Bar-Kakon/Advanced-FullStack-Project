import { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import {
  CommissionTrackingModel,
  type CommissionTrackingRecord,
  type TrackingArrangement,
} from './commissionTracking.model.js';

export interface TrackingUpsert {
  readonly task: Types.ObjectId;
  readonly company: Types.ObjectId;
  readonly commissionedBy: Types.ObjectId;
  readonly arrangement: TrackingArrangement;
  readonly trackee?: Types.ObjectId;
  readonly assignedBy: Types.ObjectId;
}

export interface CommissionTrackingRepository {
  /** All-or-nothing under the caller's transaction: a poisoned batch writes no row at all. */
  upsertMany(rows: readonly TrackingUpsert[], session?: DbSession): Promise<void>;
  listByTasks(tasks: readonly Types.ObjectId[], session?: DbSession): Promise<CommissionTrackingRecord[]>;
  listByTrackee(trackee: Types.ObjectId): Promise<CommissionTrackingRecord[]>;
}

export const commissionTrackingRepository: CommissionTrackingRepository = {
  async upsertMany(rows, session) {
    for (const row of rows) {
      await CommissionTrackingModel.updateOne(
        { task: row.task },
        {
          $set: {
            company: row.company,
            commissionedBy: row.commissionedBy,
            arrangement: row.arrangement,
            assignedBy: row.assignedBy,
            assignedAt: new Date(),
            ...(row.trackee === undefined ? {} : { trackee: row.trackee }),
          },
          ...(row.trackee === undefined ? { $unset: { trackee: '' } } : {}),
        },
        { upsert: true, ...(session ? { session } : {}) },
      ).exec();
    }
  },

  async listByTasks(tasks, session) {
    if (tasks.length === 0) return [];
    return CommissionTrackingModel.find({ task: { $in: tasks } })
      .session(session ?? null)
      .lean<CommissionTrackingRecord[]>()
      .exec();
  },

  async listByTrackee(trackee) {
    return CommissionTrackingModel.find({ trackee }).lean<CommissionTrackingRecord[]>().exec();
  },
};
