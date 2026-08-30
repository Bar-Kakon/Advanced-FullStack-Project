import type { AuditEntry, ProposalListRow } from './coordination.types';

import type { Project } from './projects.types';

export interface CalendarAdoption {
  readonly fromVersion: number | null;
  readonly toVersion: number;
  readonly adoptedAt: string;
  readonly adoptedByName: string | null;
  readonly overridesKept: boolean;
}

export interface ProjectCalendarState {
  /** The company version this project is pinned to. A company edit never moves it. */
  readonly versionNumber: number | null;
  readonly currentVersionNumber: number | null;
  readonly outdated: boolean;
  readonly overridden: boolean;
  readonly adoptions: readonly CalendarAdoption[];
}

export interface DashboardViewer {
  readonly manages: boolean;
  readonly canEdit: boolean;
  readonly canCancel: boolean;
  readonly canManageCalendar: boolean;
  readonly canInvite: boolean;
  readonly canManageMembers: boolean;
  readonly canGrantPermissions: boolean;
  readonly canCreateTasks: boolean;
  readonly canManageSchedule: boolean;
  readonly canPartialRelease: boolean;
}

export interface ProjectCoordination {
  readonly openProposals: number;
  readonly awaitingMe: number;
  readonly proposals: readonly ProposalListRow[];
  readonly audit: readonly AuditEntry[];
}

export interface ProjectTaskSummary {
  readonly total: number;
  readonly open: number;
  readonly overdue: number;
  readonly completed: number;
}

export interface ProjectDashboard {
  readonly project: Project;
  readonly viewer: DashboardViewer;
  readonly calendar: ProjectCalendarState;
  readonly members: { readonly active: number; readonly pending: number };
  /** `null` while the Tasks domain does not exist. Never rendered as a zero. */
  readonly tasks: ProjectTaskSummary | null;
  readonly coordination: ProjectCoordination;
}
