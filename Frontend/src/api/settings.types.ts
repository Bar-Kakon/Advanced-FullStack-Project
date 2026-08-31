export type SettingsLanguage = 'he' | 'en';

export interface NotificationTimingRule {
  readonly notificationClass: 'blocking' | 'nonblocking';
  readonly quietFromMinute: number;
  readonly quietToMinute: number;
}

export interface ContactVisibility {
  readonly email: boolean;
  readonly businessPhone: boolean;
  readonly officePhone: boolean;
}

/**
 * The entitlement flags travel with the values so a section can explain what a tier does not
 * include instead of drawing a control the server would ignore. They are advisory here and
 * authoritative there.
 */
export interface SettingsEntitlements {
  readonly planCode: string;
  readonly emailNotifications: boolean;
  readonly notificationDigest: boolean;
  readonly notificationTimingControls: boolean;
}

export interface AccountSettings {
  readonly language: SettingsLanguage;
  readonly notifications: {
    readonly operationalEmail: boolean;
    readonly timing: readonly NotificationTimingRule[];
    readonly digestHour: number | null;
  };
  readonly contactVisibility: ContactVisibility;
  readonly mutedProjects: readonly { readonly projectId: string; readonly name: string }[];
  readonly entitlements: SettingsEntitlements;
}
