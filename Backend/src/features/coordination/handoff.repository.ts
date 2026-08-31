import { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import {
  OPEN_HANDOFF_STATES,
  WorkHandoffModel,
  type HandoffKind,
  type HandoffRecord,
  type HandoffState,
} from './handoff.model.js';

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
  findOpenForTask(task: Types.ObjectId): Promise<HandoffRecord | null>;
  findAwaitingMembership(
    project: Types.ObjectId,
    to: Types.ObjectId,
    session?: DbSession,
  ): Promise<HandoffRecord | null>;
  listAcceptedFrom(from: Types.ObjectId): Promise<HandoffRecord[]>;
  listPendingFor(userId: Types.ObjectId, managedProjects: readonly Types.ObjectId[]): Promise<HandoffRecord[]>;
  holdForMembership(
    id: Types.ObjectId,
    membership: Types.ObjectId,
  ): Promise<HandoffRecord | null>;
  accept(
    id: Types.ObjectId,
    by: Types.ObjectId,
    at: Date,
    from: readonly HandoffState[],
    session?: DbSession,
  ): Promise<HandoffRecord | null>;
  settle(
    id: Types.ObjectId,
    state: 'declined' | 'cancelled',
    by: Types.ObjectId,
    at: Date,
    from: readonly HandoffState[],
    session?: DbSession,
  ): Promise<HandoffRecord | null>;
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

  async findOpenForTask(task) {
    return WorkHandoffModel.findOne({ task, state: { $in: [...OPEN_HANDOFF_STATES] } })
      .lean<HandoffRecord>()
      .exec();
  },

  async findAwaitingMembership(project, to, session) {
    const query = WorkHandoffModel.findOne({ project, to, state: 'awaiting_membership' });
    if (session) query.session(session);
    return query.lean<HandoffRecord>().exec();
  },

  async listAcceptedFrom(from) {
    return WorkHandoffModel.find({ from, state: 'accepted' })
      .sort({ decidedAt: -1 })
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

  async holdForMembership(id, membership) {
    return WorkHandoffModel.findOneAndUpdate(
      { _id: id, state: 'proposed' },
      { $set: { state: 'awaiting_membership', membership } },
      { new: true },
    )
      .lean<HandoffRecord>()
      .exec();
  },

  async accept(id, by, at, from, session) {
    return WorkHandoffModel.findOneAndUpdate(
      { _id: id, state: { $in: [...from] } },
      { $set: { state: 'accepted', decidedBy: by, decidedAt: at } },
      { new: true, ...(session ? { session } : {}) },
    )
      .lean<HandoffRecord>()
      .exec();
  },

  async settle(id, state, by, at, from) {
    return WorkHandoffModel.findOneAndUpdate(
      { _id: id, state: { $in: [...from] } },
      { $set: { state, decidedBy: by, decidedAt: at } },
      { new: true },
    )
      .lean<HandoffRecord>()
      .exec();
  },
};
