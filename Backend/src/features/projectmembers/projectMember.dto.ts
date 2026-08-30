import type { ProjectMembershipStatus, ProjectRole } from '../projectaccess/projectMembership.model.js';
import type { ProjectPermission } from '../projectaccess/projectPermission.js';
import type { ProjectType } from '../projects/projectType.js';

export interface ProjectMemberDto {
  /** The membership row's id. It is the same id the Permissions endpoints call a grant. */
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  /** The business this person acts through here. Attribution only — it grants nothing. */
  readonly companyName: string | null;
  readonly status: ProjectMembershipStatus;
  readonly projectRole: ProjectRole;
  /** `null` when the viewer may not administer permissions here. */
  readonly permissions: readonly ProjectPermission[] | null;
  readonly fullAuthority: boolean | null;
  readonly invitedByName: string | null;
  readonly invitedAt: string;
  readonly isViewer: boolean;
}

/** What this viewer may do on this project, so the screen renders no control the API would refuse. */
export interface MemberViewerDto {
  readonly canInvite: boolean;
  readonly canManageMembers: boolean;
  readonly canGrantPermissions: boolean;
}

export interface ProjectMembersDto {
  readonly projectId: string;
  readonly projectName: string;
  readonly members: readonly ProjectMemberDto[];
  readonly invitations: readonly ProjectMemberDto[];
  readonly viewer: MemberViewerDto;
  readonly allPermissions: readonly ProjectPermission[];
  readonly allRoles: readonly ProjectRole[];
}

/**
 * What an invited person is told BEFORE they answer, and the whole of it.
 *
 * Owner decision (2026-08-30): name, type, city, both dates, who invited and the offered role. No
 * member list, no tasks, no files and no counts, because none of that is needed to answer.
 */
export interface ProjectInvitationDto {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly projectType: ProjectType;
  readonly projectTypeOther: string | null;
  readonly city: string | null;
  readonly startDate: string;
  readonly targetEndDate: string;
  readonly invitedByName: string | null;
  readonly projectRole: ProjectRole;
  readonly invitedAt: string;
}
