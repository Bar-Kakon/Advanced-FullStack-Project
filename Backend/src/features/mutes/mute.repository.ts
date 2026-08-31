import { Types } from 'mongoose';

import { MuteModel, type MuteRecord, type MuteScope } from './mute.model.js';

const DUPLICATE_KEY_CODE = 11000;

export interface MuteRepository {
  isMuted(user: Types.ObjectId, scope: MuteScope, target: Types.ObjectId): Promise<boolean>;
  mutedTargets(user: Types.ObjectId, scope: MuteScope, targets: readonly Types.ObjectId[]): Promise<Set<string>>;
  add(user: Types.ObjectId, scope: MuteScope, target: Types.ObjectId): Promise<void>;
  remove(user: Types.ObjectId, scope: MuteScope, target: Types.ObjectId): Promise<void>;
  listForUser(user: Types.ObjectId): Promise<MuteRecord[]>;
}

export const muteRepository: MuteRepository = {
  async isMuted(user, scope, target) {
    return (await MuteModel.countDocuments({ user, scope, target }).exec()) > 0;
  },

  async mutedTargets(user, scope, targets) {
    if (targets.length === 0) return new Set<string>();

    const rows = await MuteModel.find({ user, scope, target: { $in: [...targets] } })
      .select('target')
      .lean<{ target: Types.ObjectId }[]>()
      .exec();
    return new Set(rows.map((row) => row.target.toString()));
  },

  async add(user, scope, target) {
    try {
      await MuteModel.create({ user, scope, target });
    } catch (error) {
      if ((error as { code?: number }).code !== DUPLICATE_KEY_CODE) throw error;
    }
  },

  async remove(user, scope, target) {
    await MuteModel.deleteOne({ user, scope, target }).exec();
  },

  async listForUser(user) {
    return MuteModel.find({ user }).sort({ createdAt: -1 }).lean<MuteRecord[]>().exec();
  },
};
