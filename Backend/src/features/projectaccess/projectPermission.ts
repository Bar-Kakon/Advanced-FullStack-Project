/**
 * What may be done inside one project. Deliberately separate from `COMPANY_PERMISSIONS`: a company
 * grant says what somebody may do for their business, a project grant says what they may do on one
 * job, and the two are not the same list.
 */
export const PROJECT_PERMISSIONS = [
  'project.edit',
  'project.cancel',
  'project.calendar.manage',
  'project.member.invite',
  'project.member.manage',
  'project.permission.grant',
  'task.create',
  'task.assign',
  'schedule.exception.approve',
] as const;
export type ProjectPermission = (typeof PROJECT_PERMISSIONS)[number];

/**
 * Full Project Authority is a GRANT, not a saved copy of the list above.
 *
 * The difference matters when the list grows: a copied list stays frozen at the permissions that
 * existed the day it was made, while this flag keeps meaning "all of them" — so a permission added
 * later is included without anyone re-granting anything. It is the owner's stated requirement, and
 * it is why `fullAuthority` is stored as a boolean rather than expanded into `permissions`.
 *
 * It grants management authority only. It never moves ownership, never rewrites `createdBy`, and
 * is never implied by a company position or by being a Main Contractor.
 */
export const isFullAuthority = (grant: { fullAuthority: boolean }): boolean => grant.fullAuthority;

export const effectiveProjectPermissions = (grant: {
  fullAuthority: boolean;
  permissions: readonly ProjectPermission[];
}): readonly ProjectPermission[] =>
  grant.fullAuthority ? PROJECT_PERMISSIONS : grant.permissions;
