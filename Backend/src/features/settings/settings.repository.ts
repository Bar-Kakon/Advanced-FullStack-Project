import { Types } from 'mongoose';

import {
  UserModel,
  type ContactVisibility,
  type NotificationTimingRule,
  type UserLanguage,
} from '../users/user.model.js';

/**
 * The preference boundary. Every settings write goes through here, against the fields that already
 * own each value — `users.language`, `users.notificationPreferences`, `users.contactVisibility` —
 * so nothing is duplicated into a settings blob that could then disagree with the field the rest
 * of the product reads.
 *
 * Project Mute is deliberately NOT here. It is a preference about one user and one project, it
 * lives in its own collection with its own uniqueness rule, and folding it into a per-user
 * document would lose that.
 */
export interface SettingsRow {
  readonly language: UserLanguage;
  readonly notificationPreferences?: {
    readonly operationalEmail?: boolean;
    readonly timing?: readonly NotificationTimingRule[];
    readonly digestHour?: number;
  };
  readonly contactVisibility?: Partial<ContactVisibility>;
}

export interface NotificationPreferencesUpdate {
  readonly operationalEmail?: boolean;
  readonly timing?: readonly NotificationTimingRule[];
  readonly digestHour?: number;
}

export interface SettingsRepository {
  find(user: Types.ObjectId): Promise<SettingsRow | null>;
  setLanguage(user: Types.ObjectId, language: UserLanguage): Promise<void>;
  setNotificationPreferences(
    user: Types.ObjectId,
    update: NotificationPreferencesUpdate,
  ): Promise<void>;
  setContactVisibility(user: Types.ObjectId, update: Partial<ContactVisibility>): Promise<void>;
}

const SELECT = 'language notificationPreferences contactVisibility';

export const settingsRepository: SettingsRepository = {
  async find(user) {
    return UserModel.findById(user).select(SELECT).lean<SettingsRow>().exec();
  },

  async setLanguage(user, language) {
    await UserModel.updateOne({ _id: user }, { $set: { language } }).exec();
  },

  /**
   * Written field by field rather than as a whole sub-document, so setting the opt-in cannot erase
   * timing rules a Premium account configured earlier.
   */
  async setNotificationPreferences(user, update) {
    const $set: Record<string, unknown> = {};
    if (update.operationalEmail !== undefined) {
      $set['notificationPreferences.operationalEmail'] = update.operationalEmail;
    }
    if (update.timing !== undefined) $set['notificationPreferences.timing'] = [...update.timing];
    if (update.digestHour !== undefined) {
      $set['notificationPreferences.digestHour'] = update.digestHour;
    }
    if (Object.keys($set).length === 0) return;

    await UserModel.updateOne({ _id: user }, { $set }).exec();
  },

  async setContactVisibility(user, update) {
    const $set: Record<string, unknown> = {};
    for (const key of ['email', 'businessPhone', 'officePhone'] as const) {
      if (update[key] !== undefined) $set[`contactVisibility.${key}`] = update[key];
    }
    if (Object.keys($set).length === 0) return;

    await UserModel.updateOne({ _id: user }, { $set }).exec();
  },
};
