import type { Availability, CompanyPosition, CompanyStanding } from './types';

/** Mirrored from `Backend/src/features/dashboard/dashboard.dto.ts`. */
export const PROFILE_REMINDER_KEYS = [
  'contactRoute',
  'specialties',
  'region',
  'structuredPlace',
  'travelRadius',
  'bio',
  'avatar',
  'businessPhone',
  'officePhone',
  'schedulingPrefs',
  'completedWork',
] as const;
export type ProfileReminderKey = (typeof PROFILE_REMINDER_KEYS)[number];

export type ProfileReminderImportance = 'required' | 'suggested';

export interface ProfileReminderItem {
  readonly key: ProfileReminderKey;
  readonly importance: ProfileReminderImportance;
}

export interface ProfileReminder {
  readonly visible: boolean;
  readonly version: number;
  readonly missing: readonly ProfileReminderItem[];
  readonly dismissedKeys: readonly string[];
}

export interface DashboardIdentity {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly avatarUrl: string | null;
}

export interface DashboardCompany {
  readonly id: string;
  readonly name: string;
  readonly standing: CompanyStanding;
  readonly companyPosition: CompanyPosition | null;
  readonly availability: Availability;
}

export interface DashboardNetwork {
  readonly connected: number;
  readonly incoming: number;
  readonly outgoing: number;
  readonly blocked: number;
}

export interface DashboardTeam {
  readonly pendingApproval: number;
  readonly openInvitations: number;
  readonly active: number;
}

export interface DashboardReputation {
  /** `null` until somebody has actually rated them. Never rendered, or treated, as zero. */
  readonly rating: { readonly average: number; readonly count: number } | null;
  readonly completedWork: number;
}

export interface Dashboard {
  readonly identity: DashboardIdentity;
  readonly company: DashboardCompany | null;
  /** `null` when the caller may not manage the company, so no team figure is shown at all. */
  readonly team: DashboardTeam | null;
  readonly network: DashboardNetwork;
  readonly reputation: DashboardReputation;
  readonly profileReminder: ProfileReminder;
  readonly pendingActions: { readonly proposals: number; readonly handoffs: number; readonly total: number };
}

export interface DashboardResponse {
  readonly dashboard: Dashboard;
}

export interface ProfileReminderResponse {
  readonly profileReminder: ProfileReminder;
  readonly pendingActions: { readonly proposals: number; readonly handoffs: number; readonly total: number };
}
