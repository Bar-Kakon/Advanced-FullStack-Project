import { useCallback, useEffect, useRef, useState } from 'react';

import {
  fetchSettings,
  saveContactVisibility,
  saveLanguage,
  saveNotificationSettings,
  setProjectMute,
} from '../../api/settings.api';
import type {
  AccountSettings,
  ContactVisibility,
  NotificationTimingRule,
  SettingsLanguage,
} from '../../api/settings.types';

export type SettingsFailure = 'network' | 'load' | 'save';

/** Each section saves on its own, so one failure never rolls back an unrelated confirmed change. */
export type SettingsSection = 'language' | 'notifications' | 'contact' | 'mutes';

const classify = (error: unknown, fallback: SettingsFailure): SettingsFailure =>
  (error as { response?: unknown }).response === undefined ? 'network' : fallback;

export const useSettings = () => {
  const [settings, setSettings] = useState<AccountSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<SettingsSection | null>(null);
  const [savedSection, setSavedSection] = useState<SettingsSection | null>(null);
  const [failure, setFailure] = useState<SettingsFailure | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchSettings(controller.signal)
      .then((loaded) => {
        if (mounted.current) setSettings(loaded);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted || !mounted.current) return;
        setFailure(classify(error, 'load'));
      })
      .finally(() => {
        if (mounted.current) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const run = useCallback(
    async (section: SettingsSection, work: () => Promise<AccountSettings | void>): Promise<void> => {
      setBusy(section);
      setSavedSection(null);
      try {
        const next = await work();
        if (!mounted.current) return;
        if (next) setSettings(next);
        setSavedSection(section);
        setFailure(null);
      } catch (error) {
        if (mounted.current) setFailure(classify(error, 'save'));
      } finally {
        if (mounted.current) setBusy(null);
      }
    },
    [],
  );

  return {
    settings,
    loading,
    busy,
    savedSection,
    failure,
    setLanguage: (language: SettingsLanguage) => run('language', () => saveLanguage(language)),
    setNotifications: (payload: {
      operationalEmail?: boolean;
      timing?: readonly NotificationTimingRule[];
      digestHour?: number;
    }) => run('notifications', () => saveNotificationSettings(payload)),
    setContactVisibility: (payload: Partial<ContactVisibility>) =>
      run('contact', () => saveContactVisibility(payload)),
    unmuteProject: (projectId: string) =>
      run('mutes', async () => {
        await setProjectMute(projectId, false);
        return fetchSettings();
      }),
  };
};
