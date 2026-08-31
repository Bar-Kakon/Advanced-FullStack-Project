import type { Region } from './types';
import type { StructuredPlace } from '../location/place.types';

/** Mirrored from `Backend/src/features/projects/projectLifecycle.service.ts`. Derived, never set. */
export const PROJECT_STATUSES = ['planned', 'active', 'paused', 'completed'] as const;
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];

export interface ProjectLocation {
  readonly place: StructuredPlace | null;
  readonly city: string | null;
  readonly region: Region | null;
  readonly address: string | null;
}

export interface ProjectDates {
  /** `YYYY-MM-DD`. Never a timestamp, so no timezone can move the day. */
  readonly startDate: string;
  readonly targetEndDate: string;
  /** What was promised at creation. Never rewritten. */
  readonly originalTargetEndDate: string;
  /** `x`, set once at creation and immutable afterwards. */
  readonly overrunAllowanceDays: number;
  /** `originalTargetEndDate + overrunAllowanceDays`. The target may never pass it. */
  readonly overrunCeilingDate: string;
  readonly overrunDaysFromOriginal: number;
}

/** Mirrored from `Backend/src/features/projects/projectType.ts`. */
export const PROJECT_TYPES = ['villa', 'private_house', 'building', 'other'] as const;
export type ProjectType = (typeof PROJECT_TYPES)[number];

export const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;
export type Weekday = (typeof WEEKDAYS)[number];

export const SECTORS = ['jewish', 'arab', 'mixed'] as const;
export type Sector = (typeof SECTORS)[number];

export interface WorkingCalendarConfig {
  readonly workingDays: readonly Weekday[];
  readonly hours: { readonly startMinute: number; readonly endMinute: number };
  readonly sector: Sector;
  readonly worksCholHaMoed: boolean;
  readonly worksMemorialDays: boolean;
}

export type WorkingCalendarOverrides = Partial<WorkingCalendarConfig>;

export interface ProjectCalendar {
  /** The company version this project is pinned to. A company edit does not move it. */
  readonly versionId: string;
  readonly overrides: WorkingCalendarOverrides | null;
  readonly effective: WorkingCalendarConfig | null;
  readonly adoptionCount: number;
}

export interface Project {
  readonly id: string;
  readonly companyId: string;
  readonly name: string;
  readonly description: string | null;
  readonly projectType: ProjectType;
  readonly projectTypeOther: string | null;
  /** Free text — "בניין 12 קומות", "2 בניינים". Never a category. */
  readonly size: string;
  readonly calendar: ProjectCalendar;
  readonly location: ProjectLocation;
  readonly dates: ProjectDates;
  readonly status: ProjectStatus;
  readonly cancellable: boolean;
  /** Real current management authority for this viewer. Never derived from who created it. */
  readonly viewerManages: boolean;
  readonly pendingActions: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectPage {
  readonly projects: readonly Project[];
  readonly nextCursor: string | null;
}

export interface ProjectLocationPayload {
  readonly place?: StructuredPlace;
  readonly city?: string;
  readonly region?: Region;
  readonly address?: string;
}

export interface CreateProjectPayload {
  readonly name: string;
  readonly projectType: ProjectType;
  readonly projectTypeOther?: string;
  readonly size: string;
  readonly description?: string;
  readonly location?: ProjectLocationPayload;
  readonly startDate: string;
  readonly targetEndDate: string;
  readonly overrunAllowanceDays: number;
}

/** Every field optional: a screen sends what it changed. `location: null` is an explicit clear. */
export interface UpdateProjectPayload {
  readonly name?: string;
  readonly projectType?: ProjectType;
  readonly projectTypeOther?: string;
  readonly size?: string;
  readonly description?: string;
  readonly location?: ProjectLocationPayload | null;
  readonly startDate?: string;
  readonly targetEndDate?: string;
}
