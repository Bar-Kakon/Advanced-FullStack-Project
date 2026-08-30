/**
 * What may be done inside one project. Deliberately separate from `COMPANY_PERMISSIONS`: a company
 * grant says what somebody may do for their business, a project grant says what they may do on one
 * job, and the two are not the same list.
 *
 * A code here answers ONE question: has this person been granted the capability. It never answers
 * whether a particular exercise of it is lawful — the closed domain authority chains constrain that
 * separately, and a grant may not override one. The two are not interchangeable.
 */
export const PROJECT_PERMISSIONS = [
  /** Project METADATA only. It confers no authority over the construction sequence. */
  'project.edit',
  'project.cancel',
  'project.calendar.manage',
  /**
   * Stage and construction-sequence management: creating stages, their names and details, their
   * order, the edges between them, and the `isGate` threshold. Owner decision 2026-08-30, replacing
   * an engineering assumption that `project.edit` covered sequencing. Order and the gate flag are
   * deliberately NOT separate codes — they are one capability.
   */
  'project.stage.manage',
  'project.member.invite',
  'project.member.manage',
  'project.permission.grant',
  'task.create',
  'task.assign',
  'schedule.exception.approve',
  /**
   * שחרור חלקי — releasing downstream work before the stage it waits on is fully complete. Owner
   * decision 2026-08-30, and its own code: it is NOT `schedule.exception.approve`, which answers a
   * different question, and NOT `project.stage.manage`, which shapes the sequence rather than
   * releasing against it.
   *
   * Holding this grants the CAPABILITY only. The closed domain chain still governs each exercise —
   * the GC originates, a מנהל אתרים / סמנכ״ל acts only on the GC's instruction, and a מנהל עבודה
   * only where that chain reaches him. No endpoint reads this yet.
   */
  'schedule.partial_release.manage',
  /**
   * Versioned work plans on this project and its tasks: uploading a plan, adding a version, and
   * deciding which version is current. Owner decision 2026-08-30. It does NOT replace the task's
   * own parties, who may upload against their own task without holding it.
   */
  'workplan.manage',
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
