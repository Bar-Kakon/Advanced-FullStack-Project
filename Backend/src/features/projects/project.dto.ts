import type { StructuredPlace } from '../location/place.types.js';
import type { Region } from '../users/user.model.js';
import type { ProjectStatus } from './projectLifecycle.service.js';

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

export interface ProjectDto {
  readonly id: string;
  readonly companyId: string;
  readonly name: string;
  readonly description: string | null;
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
