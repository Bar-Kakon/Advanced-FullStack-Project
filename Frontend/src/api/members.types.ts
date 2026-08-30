import type { ProjectPermission, ProjectRole } from './permissions.types';
import type { ProjectType } from './projects.types';

/** Mirrored from `Backend/src/features/projectaccess/projectMembership.model.ts`. */
export const MEMBERSHIP_STATUSES = ['invited', 'active', 'declined', 'removed'] as const;
export type MembershipStatus = (typeof MEMBERSHIP_STATUSES)[number];

export interface ProjectMember {
  /** The membership row. The Permissions endpoints call the same id a grant. */
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  /** The business this person acts through. Attribution only — it grants nothing. */
  readonly companyName: string | null;
  readonly status: MembershipStatus;
  readonly projectRole: ProjectRole;
  /** `null` when this viewer may not administer permissions here. */
  readonly permissions: readonly ProjectPermission[] | null;
  readonly fullAuthority: boolean | null;
  readonly invitedByName: string | null;
  readonly invitedAt: string;
  readonly isViewer: boolean;
}

export interface MemberViewer {
  readonly canInvite: boolean;
  readonly canManageMembers: boolean;
  readonly canGrantPermissions: boolean;
}

export interface ProjectMembers {
  readonly projectId: string;
  readonly projectName: string;
  readonly members: readonly ProjectMember[];
  readonly invitations: readonly ProjectMember[];
  readonly viewer: MemberViewer;
  readonly allPermissions: readonly ProjectPermission[];
  readonly allRoles: readonly ProjectRole[];
}

/** Exactly what an invited person is told before answering, and no more. */
export interface ProjectInvitation {
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

export interface InvitePayload {
  readonly userId: string;
  readonly projectRole: ProjectRole;
  readonly permissions?: readonly ProjectPermission[];
  readonly fullAuthority?: boolean;
  readonly templateId?: string;
  readonly copyFromGrantId?: string;
}
