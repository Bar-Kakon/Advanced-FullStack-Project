import type { StructuredPlace } from '../location/place.types.js';
import type { Region } from '../users/user.model.js';
import type { ProjectStatus } from './projectLifecycle.service.js';
import type { ProjectType } from './projectType.js';
import type { WorkingCalendarConfig, WorkingCalendarOverrides } from '../calendar/workingCalendar.types.js';

export interface ProjectLocationDto {
  readonly place: StructuredPlace | null;
  readonly city: string | null;
  readonly region: Region | null;
  readonly address: string | null;
}

export interface ProjectDatesDto {
  /** Calendar dates, `YYYY-MM-DD`. Never a timestamp, so no timezone can move them a day. */
  readonly startDate: string;
  readonly targetEndDate: string;
  /** What was promised when the project was created. Never rewritten. */
  readonly originalTargetEndDate: string;
  /** `x`, set once at creation and immutable thereafter. */
  readonly overrunAllowanceDays: number;
  /** `originalTargetEndDate + overrunAllowanceDays`. The target may never pass this. */
  readonly overrunCeilingDate: string;
  /** Days the current target sits past the original. Zero when it has not moved. */
  readonly overrunDaysFromOriginal: number;
}

export interface ProjectCalendarDto {
  /** The exact company version this project is pinned to. A company edit does not move it. */
  readonly versionId: string;
  readonly overrides: WorkingCalendarOverrides | null;
  /** Base plus overrides — what the project actually works by. */
  readonly effective: WorkingCalendarConfig | null;
  readonly adoptionCount: number;
}

export interface ProjectDto {
  readonly id: string;
  readonly companyId: string;
  readonly name: string;
  readonly description: string | null;
  readonly projectType: ProjectType;
  /** Free text, kept apart from the canonical value. Present only when the type is `other`. */
  readonly projectTypeOther: string | null;
  /** Free text by decision — "בניין 10/12 קומות", "2 בניינים". Never a category. */
  readonly size: string;
  readonly calendar: ProjectCalendarDto;
  readonly location: ProjectLocationDto;
  readonly dates: ProjectDatesDto;
  /** Derived on read, never stored, never settable. */
  readonly status: ProjectStatus;
  /** Whether the pre-start cancellation is available to this project right now. */
  readonly cancellable: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProjectPageDto {
  readonly projects: readonly ProjectDto[];
  readonly nextCursor: string | null;
}
