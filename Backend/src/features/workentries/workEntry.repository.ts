import { Types } from 'mongoose';

import { WorkEntryModel, type WorkEntryRecord } from './workEntry.model.js';

export interface NewWorkEntry {
  readonly owner: Types.ObjectId;
  readonly title: string;
  readonly scope?: string;
  readonly meta: string;
  readonly project?: Types.ObjectId;
  readonly task?: Types.ObjectId;
  readonly fieldSyncVerifiedAt?: Date;
  readonly image?: Types.ObjectId;
}

/** Only the three fields the owner typed. The badge and both links stay out of reach of an edit. */
export interface WorkEntryEdit {
  readonly title?: string;
  readonly scope?: string | null;
  readonly meta?: string;
  readonly image?: Types.ObjectId;
}

export interface WorkEntryRepository {
  create(entry: NewWorkEntry): Promise<WorkEntryRecord>;
  listByOwner(owner: Types.ObjectId): Promise<WorkEntryRecord[]>;
  /** Owner is part of the filter, so another person's entry is simply not found. */
  findOwnedById(id: string, owner: Types.ObjectId): Promise<WorkEntryRecord | null>;
  updateOwnedById(id: string, owner: Types.ObjectId, edit: WorkEntryEdit): Promise<WorkEntryRecord | null>;
  deleteOwnedById(id: string, owner: Types.ObjectId): Promise<boolean>;
}

export const workEntryRepository: WorkEntryRepository = {
  async create(entry) {
    const created = await WorkEntryModel.create(entry);
    return created.toObject() as WorkEntryRecord;
  },

  async listByOwner(owner) {
    return WorkEntryModel.find({ owner }).sort({ createdAt: -1 }).lean<WorkEntryRecord[]>().exec();
  },

  async findOwnedById(id, owner) {
    if (!Types.ObjectId.isValid(id)) return null;

    return WorkEntryModel.findOne({ _id: new Types.ObjectId(id), owner })
      .lean<WorkEntryRecord>()
      .exec();
  },

  async updateOwnedById(id, owner, edit) {
    if (!Types.ObjectId.isValid(id)) return null;

    const set: Record<string, unknown> = {};
    const unset: Record<string, ''> = {};

    if (edit.title !== undefined) set['title'] = edit.title;
    if (edit.meta !== undefined) set['meta'] = edit.meta;
    if (edit.image !== undefined) set['image'] = edit.image;
    if (edit.scope === null) unset['scope'] = '';
    else if (edit.scope !== undefined) set['scope'] = edit.scope;

    return WorkEntryModel.findOneAndUpdate(
      { _id: new Types.ObjectId(id), owner },
      {
        ...(Object.keys(set).length > 0 ? { $set: set } : {}),
        ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
      },
      { returnDocument: 'after' },
    )
      .lean<WorkEntryRecord>()
      .exec();
  },

  async deleteOwnedById(id, owner) {
    if (!Types.ObjectId.isValid(id)) return false;

    const result = await WorkEntryModel.deleteOne({ _id: new Types.ObjectId(id), owner }).exec();
    return result.deletedCount === 1;
  },
};
