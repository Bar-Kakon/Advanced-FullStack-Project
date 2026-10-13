import { isAxiosError } from 'axios';

import { api } from './client';
import type { ApiErrorBody } from './types';
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

export type AccountClosureFailure = 'IN_COMPANY' | 'NETWORK' | 'UNKNOWN';

/** The D8 closure request: a recoverable deactivation, refused while obligations stay open. */
export const requestAccountClosure = async (): Promise<void> => {
  await api.delete('/users/me');
};

export const classifyAccountClosureError = (error: unknown): AccountClosureFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  const body = error.response.data as ApiErrorBody | undefined;
  switch (body?.code) {
    case 'ACCOUNT_IN_COMPANY':
      return 'IN_COMPANY';
    default:
      return 'UNKNOWN';
  }
};
