import { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import { WorkHandoffModel, type HandoffKind, type HandoffRecord } from './handoff.model.js';

export interface NewHandoff {
  readonly project: Types.ObjectId;
  readonly task: Types.ObjectId;
  readonly from: Types.ObjectId;
  readonly to: Types.ObjectId;
  readonly kind: HandoffKind;
  readonly initiatedBy: Types.ObjectId;
  readonly completedWorkAtHandover: string;
  readonly proposal?: Types.ObjectId;
}

export interface HandoffRepository {
  create(handoff: NewHandoff): Promise<HandoffRecord>;
  findById(id: string): Promise<HandoffRecord | null>;
  findProposedForTask(task: Types.ObjectId): Promise<HandoffRecord | null>;
  listAcceptedFrom(from: Types.ObjectId): Promise<HandoffRecord[]>;
  listAwaiting(userId: Types.ObjectId): Promise<HandoffRecord[]>;
  listPendingFor(userId: Types.ObjectId, managedProjects: readonly Types.ObjectId[]): Promise<HandoffRecord[]>;
  accept(id: Types.ObjectId, by: Types.ObjectId, at: Date, session?: DbSession): Promise<HandoffRecord | null>;
  settle(id: Types.ObjectId, state: 'declined' | 'cancelled', by: Types.ObjectId, at: Date): Promise<HandoffRecord | null>;
}

export const handoffRepository: HandoffRepository = {
  async create(handoff) {
    const created = await WorkHandoffModel.create({ ...handoff, state: 'proposed' });
    return created.toObject() as unknown as HandoffRecord;
  },

  async findById(id) {
    if (!Types.ObjectId.isValid(id)) return null;
    return WorkHandoffModel.findById(new Types.ObjectId(id)).lean<HandoffRecord>().exec();
  },

  async findProposedForTask(task) {
    return WorkHandoffModel.findOne({ task, state: 'proposed' }).lean<HandoffRecord>().exec();
  },

  async listAcceptedFrom(from) {
    return WorkHandoffModel.find({ from, state: 'accepted' })
      .sort({ decidedAt: -1 })
      .lean<HandoffRecord[]>()
      .exec();
  },

  async listAwaiting(userId) {
    return WorkHandoffModel.find({
      state: 'proposed',
      $or: [{ to: userId }, { from: userId }],
    })
      .lean<HandoffRecord[]>()
      .exec();
  },

  async listPendingFor(userId, managedProjects) {
    return WorkHandoffModel.find({
      state: 'proposed',
      $or: [{ to: userId }, { project: { $in: [...managedProjects] } }],
    })
      .lean<HandoffRecord[]>()
      .exec();
  },

  async accept(id, by, at, session) {
    return WorkHandoffModel.findOneAndUpdate(
      { _id: id, state: 'proposed' },
      { $set: { state: 'accepted', decidedBy: by, decidedAt: at } },
      { new: true, ...(session ? { session } : {}) },
    )
      .lean<HandoffRecord>()
      .exec();
  },

  async settle(id, state, by, at) {
    return WorkHandoffModel.findOneAndUpdate(
      { _id: id, state: 'proposed' },
      { $set: { state, decidedBy: by, decidedAt: at } },
      { new: true },
    )
      .lean<HandoffRecord>()
      .exec();
  },
};
