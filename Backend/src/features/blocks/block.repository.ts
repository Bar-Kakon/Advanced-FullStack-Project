import { Types } from 'mongoose';

import { BlockModel, type BlockRecord } from './block.model.js';

export interface BlockRepository {
  create(blockerUserId: string, blockedUserId: string): Promise<Types.ObjectId | null>;
  remove(blockerUserId: string, blockedUserId: string): Promise<boolean>;
  /** Everyone this viewer may not see in discovery, in either direction, as one id list. */
  findHiddenUserIds(userId: string): Promise<Types.ObjectId[]>;
  /** Only the rows this viewer created, which is what My Network will offer Unblock for. */
  listCreatedBy(userId: string): Promise<BlockRecord[]>;
  exists(blockerUserId: string, blockedUserId: string): Promise<boolean>;
}

const DUPLICATE_KEY_CODE = 11000;

const toObjectId = (id: string): Types.ObjectId | null =>
  Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;

export const blockRepository: BlockRepository = {
  /** `null` when the same block already exists; the unique index is what decides that. */
  async create(blockerUserId, blockedUserId) {
    const blocker = toObjectId(blockerUserId);
    const blocked = toObjectId(blockedUserId);
    if (blocker === null || blocked === null) return null;

    try {
      const [created] = await BlockModel.create([{ blockerUserId: blocker, blockedUserId: blocked }]);
      return created?._id ?? null;
    } catch (error) {
      if ((error as { code?: number }).code === DUPLICATE_KEY_CODE) return null;
      throw error;
    }
  },

  async remove(blockerUserId, blockedUserId) {
    const blocker = toObjectId(blockerUserId);
    const blocked = toObjectId(blockedUserId);
    if (blocker === null || blocked === null) return false;

    const result = await BlockModel.deleteOne({ blockerUserId: blocker, blockedUserId: blocked }).exec();
    return result.deletedCount === 1;
  },

  async findHiddenUserIds(userId) {
    const viewer = toObjectId(userId);
    if (viewer === null) return [];

    const rows = await BlockModel.find({
      $or: [{ blockerUserId: viewer }, { blockedUserId: viewer }],
    })
      .select('blockerUserId blockedUserId')
      .lean<Pick<BlockRecord, 'blockerUserId' | 'blockedUserId'>[]>()
      .exec();

    const hidden = new Map<string, Types.ObjectId>();
    for (const row of rows) {
      const other = row.blockerUserId.equals(viewer) ? row.blockedUserId : row.blockerUserId;
      hidden.set(other.toString(), other);
    }

    return [...hidden.values()];
  },

  async listCreatedBy(userId) {
    const viewer = toObjectId(userId);
    if (viewer === null) return [];

    return BlockModel.find({ blockerUserId: viewer })
      .sort({ createdAt: -1 })
      .lean<BlockRecord[]>()
      .exec();
  },

  async exists(blockerUserId, blockedUserId) {
    const blocker = toObjectId(blockerUserId);
    const blocked = toObjectId(blockedUserId);
    if (blocker === null || blocked === null) return false;

    return (await BlockModel.exists({ blockerUserId: blocker, blockedUserId: blocked })) !== null;
  },
};