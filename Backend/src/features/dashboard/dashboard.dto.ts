import type { Availability } from '../companies/company.model.js';
import type { CompanyPosition, CompanyStanding } from '../companies/companyMembership.model.js';

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

export interface ProfileReminderItemDto {
  readonly key: ProfileReminderKey;
  readonly importance: ProfileReminderImportance;
}

export interface ProfileReminderDto {
  readonly visible: boolean;
  readonly version: number;
  readonly missing: readonly ProfileReminderItemDto[];
  readonly dismissedKeys: readonly string[];
}

export interface DashboardIdentityDto {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly avatarUrl: string | null;
}

export interface DashboardCompanyDto {
  readonly id: string;
  readonly name: string;
  readonly standing: CompanyStanding;
  readonly companyPosition: CompanyPosition | null;
  readonly availability: Availability;
}

export interface DashboardNetworkDto {
  readonly connected: number;
  readonly incoming: number;
  readonly outgoing: number;
  readonly blocked: number;
}

export interface DashboardTeamDto {
  readonly pendingApproval: number;
  readonly openInvitations: number;
  readonly active: number;
}

export interface DashboardReputationDto {
  readonly rating: { readonly average: number; readonly count: number } | null;
  readonly completedWork: number;
}

export interface DashboardPendingActionsDto {
  readonly proposals: number;
  readonly handoffs: number;
  readonly total: number;
}

export interface DashboardDto {
  readonly identity: DashboardIdentityDto;
  readonly company: DashboardCompanyDto | null;
  readonly network: DashboardNetworkDto;
  readonly team: DashboardTeamDto | null;
  readonly reputation: DashboardReputationDto;
  readonly profileReminder: ProfileReminderDto;
  readonly pendingActions: DashboardPendingActionsDto;
}
