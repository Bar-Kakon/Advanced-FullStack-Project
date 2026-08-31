import { Types } from 'mongoose';

import {
  UserModel,
  type NotificationTimingRule,
  type UserLanguage,
} from '../users/user.model.js';
import type { NotificationRecipientReader } from './notificationDispatch.service.js';

/**
 * The narrow read the notification machinery makes of an account: whether operational email was
 * opted into, which language to write in, and any Premium timing rules. Nothing else about the
 * person reaches this domain.
 */
export interface DeliveryTarget {
  readonly email: string;
  readonly language: UserLanguage;
  readonly operationalEmail: boolean;
  readonly timing: readonly NotificationTimingRule[];
  readonly digestHour: number | null;
}

interface DeliveryRow {
  readonly _id: Types.ObjectId;
  readonly email: string;
  readonly language: UserLanguage;
  readonly notificationPreferences?: {
    readonly operationalEmail?: boolean;
    readonly timing?: readonly NotificationTimingRule[];
    readonly digestHour?: number;
  };
}

const SELECT = 'email language notificationPreferences';

const toTarget = (row: DeliveryRow): DeliveryTarget => ({
  email: row.email,
  language: row.language,
  // Absent is refused rather than assumed: operational email is an explicit opt-in.
  operationalEmail: row.notificationPreferences?.operationalEmail === true,
  timing: row.notificationPreferences?.timing ?? [],
  digestHour: row.notificationPreferences?.digestHour ?? null,
});

export interface RecipientRepository extends NotificationRecipientReader {
  findDeliveryTarget(userId: Types.ObjectId): Promise<DeliveryTarget | null>;
  findDeliveryTargets(userIds: readonly Types.ObjectId[]): Promise<Map<string, DeliveryTarget>>;
}

export const recipientRepository: RecipientRepository = {
  async findDeliveryProfile(userId) {
    if (!Types.ObjectId.isValid(userId)) return null;

    const row = await UserModel.findById(userId).select(SELECT).lean<DeliveryRow>().exec();
    if (row === null) return null;

    const target = toTarget(row);
    return { operationalEmail: target.operationalEmail, timing: target.timing };
  },

  async findDeliveryTarget(userId) {
    const row = await UserModel.findById(userId).select(SELECT).lean<DeliveryRow>().exec();
    return row === null ? null : toTarget(row);
  },

  async findDeliveryTargets(userIds) {
    if (userIds.length === 0) return new Map();

    const rows = await UserModel.find({ _id: { $in: [...userIds] } })
      .select(SELECT)
      .lean<DeliveryRow[]>()
      .exec();
    return new Map(rows.map((row) => [row._id.toString(), toTarget(row)]));
  },
};
