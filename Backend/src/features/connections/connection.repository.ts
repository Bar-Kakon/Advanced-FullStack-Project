import { Types } from 'mongoose';

import { ConnectionModel, pairKey, type ConnectionRecord } from './connection.model.js';

export interface ConnectionRepository {
  create(requester: string, recipient: string): Promise<Types.ObjectId | null>;
  findByPair(a: string, b: string): Promise<ConnectionRecord | null>;
  /** Every edge this viewer is on, which is what Browse projects relationship state from. */
  listForUser(userId: string): Promise<ConnectionRecord[]>;
  accept(id: Types.ObjectId, recipient: Types.ObjectId): Promise<boolean>;
  decline(id: Types.ObjectId, recipient: Types.ObjectId): Promise<boolean>;
}

const DUPLICATE_KEY_CODE = 11000;

const toObjectId = (id: string): Types.ObjectId | null =>
  Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;

export const connectionRepository: ConnectionRepository = {
  async create(requester, recipient) {
    const from = toObjectId(requester);
    const to = toObjectId(recipient);
    if (from === null || to === null) return null;

    try {
      const [created] = await ConnectionModel.create([
        { requester: from, recipient: to, pair: pairKey(from, to), status: 'pending', requestedAt: new Date() },
      ]);
      return created?._id ?? null;
    } catch (error) {
      if ((error as { code?: number }).code === DUPLICATE_KEY_CODE) return null;
      throw error;
    }
  },

  async findByPair(a, b) {
    const first = toObjectId(a);
    const second = toObjectId(b);
    if (first === null || second === null) return null;

    return ConnectionModel.findOne({ pair: pairKey(first, second) }).lean<ConnectionRecord>().exec();
  },

  async listForUser(userId) {
    const viewer = toObjectId(userId);
    if (viewer === null) return [];

    return ConnectionModel.find({ $or: [{ requester: viewer }, { recipient: viewer }] })
      .lean<ConnectionRecord[]>()
      .exec();
  },

  /** The recipient is in the filter, so only the person asked can answer. */
  async accept(id, recipient) {
    const result = await ConnectionModel.updateOne(
      { _id: id, recipient, status: 'pending' },
      { $set: { status: 'accepted', respondedAt: new Date() } },
    ).exec();

    return result.modifiedCount === 1;
  },

  async decline(id, recipient) {
    const result = await ConnectionModel.updateOne(
      { _id: id, recipient, status: 'pending' },
      { $set: { status: 'declined', respondedAt: new Date() } },
    ).exec();

    return result.modifiedCount === 1;
  },
};