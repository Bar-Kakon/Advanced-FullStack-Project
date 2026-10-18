import { Types } from 'mongoose';

import type { EmailChangeTokenRepository } from '../auth/emailChangeToken.repository.js';
import type { EntitlementService } from '../billing/entitlements.service.js';
import type { MuteRepository } from '../mutes/mute.repository.js';
import type { ProjectRepository } from '../projects/project.repository.js';
import {
  normalizeVisibilityChoice,
  type ContactVisibility,
  type NotificationTimingRule,
  type UserLanguage,
} from '../users/user.model.js';
import { profileNotFound } from '../users/profile.errors.js';
import type { UserRepository } from '../users/user.repository.js';
import type { SettingsRepository } from './settings.repository.js';

/**
 * Everything the Settings screen reads, in one call.
 *
 * Entitlement flags travel with the values so the screen can explain what a tier does not include
 * rather than showing a control that would be refused. They are advisory to the client and
 * authoritative on the server: every write below re-checks them.
 */
export interface SettingsDto {
  readonly email: string;
  readonly hasPassword: boolean;
  readonly pendingEmailChange: { readonly email: string; readonly expiresAt: string } | null;
  readonly language: UserLanguage;
  readonly notifications: {
    readonly operationalEmail: boolean;
    readonly timing: readonly NotificationTimingRule[];
    readonly digestHour: number | null;
  };
  readonly contactVisibility: ContactVisibility;
  readonly googleLinked: boolean;
  readonly mutedProjects: readonly { readonly projectId: string; readonly name: string }[];
  readonly entitlements: {
    readonly planCode: string;
    readonly emailNotifications: boolean;
    readonly notificationDigest: boolean;
    readonly notificationTimingControls: boolean;
  };
}

export interface NotificationSettingsInput {
  readonly operationalEmail?: boolean;
  readonly timing?: readonly NotificationTimingRule[];
  readonly digestHour?: number;
}

export interface SettingsService {
  read(userId: string): Promise<SettingsDto>;
  setLanguage(userId: string, language: UserLanguage): Promise<SettingsDto>;
  setNotifications(userId: string, input: NotificationSettingsInput): Promise<SettingsDto>;
  setContactVisibility(userId: string, input: Partial<ContactVisibility>): Promise<SettingsDto>;
}

export interface SettingsDependencies {
  readonly settings: SettingsRepository;
  readonly mutes: MuteRepository;
  readonly projects: ProjectRepository;
  readonly entitlements: EntitlementService;
  readonly credentials: Pick<UserRepository, 'hasPassword'>;
  readonly emailChanges: Pick<EmailChangeTokenRepository, 'findPendingFor'>;
}

export const createSettingsService = ({
  settings,
  mutes,
  projects,
  entitlements,
  credentials,
  emailChanges,
}: SettingsDependencies): SettingsService => {
  const read = async (userId: string): Promise<SettingsDto> => {
    const user = new Types.ObjectId(userId);
    const [row, plan, muted, hasPassword, pending] = await Promise.all([
      settings.find(user),
      entitlements.forUser(userId),
      mutes.listForUser(user),
      credentials.hasPassword(userId),
      emailChanges.findPendingFor(user),
    ]);
    if (row === null) throw profileNotFound();

    const projectIds = muted.filter((m) => m.scope === 'project').map((m) => m.target);
    const names = await projects.listByIds(projectIds);

    const mayControlTiming = plan.limits.notificationTimingControls;

    return {
      email: row.email,
      hasPassword,
      pendingEmailChange:
        pending === null
          ? null
          : { email: pending.newEmail, expiresAt: pending.expiresAt.toISOString() },
      language: row.language,
      notifications: {
        operationalEmail: row.notificationPreferences?.operationalEmail === true,
        // A lapsed entitlement stops the stored rules being reported as in force, because the
        // dispatcher stops applying them too. The rows survive a downgrade and return on renewal.
        timing: mayControlTiming ? row.notificationPreferences?.timing ?? [] : [],
        digestHour: mayControlTiming ? row.notificationPreferences?.digestHour ?? null : null,
      },
      contactVisibility: {
        email: row.contactVisibility?.email ?? true,
        businessPhone: normalizeVisibilityChoice(row.contactVisibility?.businessPhone),
        officePhone: normalizeVisibilityChoice(row.contactVisibility?.officePhone),
      },
      googleLinked: (row.identities ?? []).some((identity) => identity.provider === 'google'),
      mutedProjects: names.map((project) => ({
        projectId: project._id.toString(),
        name: project.name,
      })),
      entitlements: {
        planCode: plan.planCode,
        emailNotifications: plan.limits.emailNotifications,
        notificationDigest: plan.limits.notificationDigest,
        notificationTimingControls: mayControlTiming,
      },
    };
  };

  return {
    read,

    /**
     * The account's own language, which is the one the emails are written in too. There is no
     * second email-language preference and no separate client copy that could disagree with it.
     */
    async setLanguage(userId, language) {
      await settings.setLanguage(new Types.ObjectId(userId), language);
      return read(userId);
    },

    /**
     * The timing fields are silently DROPPED rather than refused when the plan does not carry
     * them, so a client that sends them cannot grant itself a Premium control — and a Free account
     * editing its operational-email opt-in in the same request still succeeds.
     */
    async setNotifications(userId, input) {
      const mayControlTiming = await entitlements.mayUse(userId, 'notificationTimingControls');

      await settings.setNotificationPreferences(new Types.ObjectId(userId), {
        ...(input.operationalEmail === undefined ? {} : { operationalEmail: input.operationalEmail }),
        ...(mayControlTiming && input.timing !== undefined ? { timing: input.timing } : {}),
        ...(mayControlTiming && input.digestHour !== undefined
          ? { digestHour: input.digestHour }
          : {}),
      });
      return read(userId);
    },

    /**
     * The self-controlled half of phone visibility. It can only ever widen or narrow the cases the
     * two automatic ones do not cover, and there is no personal phone for it to reach.
     */
    async setContactVisibility(userId, input) {
      await settings.setContactVisibility(new Types.ObjectId(userId), input);
      return read(userId);
    },
  };
};
