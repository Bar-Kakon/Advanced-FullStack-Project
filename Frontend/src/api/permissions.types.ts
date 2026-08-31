/** Mirrored from `Backend/src/features/projectaccess/projectPermission.ts`. */
export const PROJECT_PERMISSIONS = [
  'project.edit',
  'project.cancel',
  'project.calendar.manage',
  'project.stage.manage',
  'project.member.invite',
  'project.member.manage',
  'project.permission.grant',
  'task.create',
  'task.assign',
  'schedule.exception.approve',
  'schedule.partial_release.manage',
] as const;
export type ProjectPermission = (typeof PROJECT_PERMISSIONS)[number];

export const PROJECT_ROLES = [
  'main_contractor',
  'subcontractor',
  'professional',
  'supplier',
  'viewer',
] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export interface Grant {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly userId: string;
  readonly status: string;
  readonly projectRole: ProjectRole;
  readonly permissions: readonly ProjectPermission[];
  /** A grant, not a saved copy of the list — later permissions are included automatically. */
  readonly fullAuthority: boolean;
}

export interface PermissionTemplate {
  readonly id: string;
  readonly name: string;
  readonly permissions: readonly ProjectPermission[];
  readonly fullAuthority: boolean;
}

export interface PermissionsOverview {
  readonly projects: readonly { readonly id: string; readonly name: string }[];
  readonly grants: readonly Grant[];
  readonly templates: readonly PermissionTemplate[];
  readonly allPermissions: readonly ProjectPermission[];
}

export interface GrantPayload {
  readonly projectId: string;
  readonly userId: string;
  readonly projectRole: ProjectRole;
  readonly permissions?: readonly ProjectPermission[];
  readonly fullAuthority?: boolean;
  readonly templateId?: string;
  readonly copyFromGrantId?: string;
}
