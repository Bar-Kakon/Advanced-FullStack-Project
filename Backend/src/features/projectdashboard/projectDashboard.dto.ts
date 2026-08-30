import type { ProjectDto } from '../projects/project.dto.js';
import type { ProjectTaskSummary } from '../projects/projectLifecycle.service.js';

/** One recorded move to a newer company calendar version, with the numbers a person can read. */
export interface CalendarAdoptionDto {
  readonly fromVersion: number | null;
  readonly toVersion: number;
  readonly adoptedAt: string;
  readonly adoptedByName: string | null;
  readonly overridesKept: boolean;
}

export interface ProjectCalendarStateDto {
  /** The version this project is pinned to. A company edit never moves it. */
  readonly versionNumber: number | null;
  readonly currentVersionNumber: number | null;
  readonly outdated: boolean;
  readonly overridden: boolean;
  readonly adoptions: readonly CalendarAdoptionDto[];
}

/** What this viewer may do here, so the screen offers no control the API would refuse. */
export interface DashboardViewerDto {
  readonly manages: boolean;
  readonly canEdit: boolean;
  readonly canCancel: boolean;
  readonly canManageCalendar: boolean;
  readonly canInvite: boolean;
  readonly canManageMembers: boolean;
  readonly canGrantPermissions: boolean;
  readonly canCreateTasks: boolean;
}

export interface ProjectDashboardDto {
  /** The existing project representation, unchanged. Nothing here restates it. */
  readonly project: ProjectDto;
  readonly viewer: DashboardViewerDto;
  readonly calendar: ProjectCalendarStateDto;
  readonly members: { readonly active: number; readonly pending: number };
  /** `null` until the Tasks domain exists. Never a fabricated count. */
  readonly tasks: ProjectTaskSummary | null;
}
