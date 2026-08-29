import { Types } from 'mongoose';

import {
  ProfileReminderDismissalModel,
  type ProfileReminderDismissalRecord,
} from './profileReminderDismissal.model.js';

export interface ProfileReminderDismissalRepository {
  findByUser(userId: string): Promise<ProfileReminderDismissalRecord | null>;
  upsert(userId: string, version: number, dismissedKeys: readonly string[]): Promise<void>;
}

const toObjectId = (id: string): Types.ObjectId | null =>
  Types.ObjectId.isValid(id) ? new Types.ObjectId(id) : null;

export const profileReminderDismissalRepository: ProfileReminderDismissalRepository = {
  async findByUser(userId) {
    const user = toObjectId(userId);
    if (user === null) return null;

    return ProfileReminderDismissalModel.findOne({ user })
      .lean<ProfileReminderDismissalRecord>()
      .exec();
  },

  async upsert(userId, version, dismissedKeys) {
    const user = toObjectId(userId);
    if (user === null) return;

    await ProfileReminderDismissalModel.updateOne(
      { user },
      { $set: { version, dismissedKeys: [...dismissedKeys], dismissedAt: new Date() } },
      { upsert: true },
    ).exec();
  },
};
