import { api } from './client';
import type {
  AccountSettings,
  ContactVisibility,
  NotificationTimingRule,
  SettingsLanguage,
} from './settings.types';

export const fetchSettings = async (signal?: AbortSignal): Promise<AccountSettings> => {
  const { data } = await api.get<{ settings: AccountSettings }>(
    '/settings',
    signal ? { signal } : {},
  );
  return data.settings;
};

export const saveLanguage = async (language: SettingsLanguage): Promise<AccountSettings> => {
  const { data } = await api.put<{ settings: AccountSettings }>('/settings/language', { language });
  return data.settings;
};

/**
 * Each section saves on its own, so one failing write never rolls back an unrelated one the person
 * had already confirmed.
 */
export const saveNotificationSettings = async (payload: {
  operationalEmail?: boolean;
  timing?: readonly NotificationTimingRule[];
  digestHour?: number;
}): Promise<AccountSettings> => {
  const { data } = await api.put<{ settings: AccountSettings }>('/settings/notifications', payload);
  return data.settings;
};

export const saveContactVisibility = async (
  payload: Partial<ContactVisibility>,
): Promise<AccountSettings> => {
  const { data } = await api.put<{ settings: AccountSettings }>(
    '/settings/contact-visibility',
    payload,
  );
  return data.settings;
};

export const setProjectMute = async (projectId: string, muted: boolean): Promise<void> => {
  await api.put(`/mutes/projects/${projectId}`, { muted });
};
