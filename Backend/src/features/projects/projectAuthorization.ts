import type { Types } from 'mongoose';

import type { CompanyContext } from '../companies/companyContext.service.js';
import type { CompanyPermission } from '../companies/companyMembership.model.js';
import type { ProjectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import {
  effectiveProjectPermissions,
  type ProjectPermission,
} from '../projectaccess/projectPermission.js';
import { noActiveCompany, notPermittedToCreate, projectNotFound } from './project.errors.js';

/**
 * Every project authority question is answered here and nowhere else.
 *
 * ALL project authority is PROJECT-SCOPED. A company permission never confers authority over a
 * project: `project.create` means "may create a project" and nothing more. When a project is
 * created its creator is given an explicit project grant, so even the creator's power is a row
 * somebody can read, reduce or revoke — not something inferred from where they work.
 *
 * Eight concepts stay separate and none is collapsed into a role field:
 *
 *   createdBy           provenance. Grants nothing, ever.
 *   company membership  belonging to a business — decides VISIBILITY, never authority
 *   companyPosition     a job title. Never read below.
 *   project membership  participating in one job
 *   projectRole         descriptive. Never read below.
 *   permissions[]       individual project grants
 *   fullAuthority       the "all of it, including later additions" project grant
 *   work delegation     D7. Not an input to anything here.
 */
export interface ProjectAuthority {
  readonly companyId: string;
  readonly userId: string;
}

const isActiveMember = (context: CompanyContext | null): context is CompanyContext =>
  context !== null && context.membershipStatus === 'active';

const holds = (context: CompanyContext, permission: CompanyPermission): boolean =>
  context.permissions.includes(permission);

export const requireActiveCompany = (
  context: CompanyContext | null,
  userId: string,
): ProjectAuthority => {
  if (!isActiveMember(context)) throw noActiveCompany();
  return { companyId: context.id, userId };
};

/** The one thing a company permission decides: whether this account may start a project at all. */
export const requireMayCreateProject = (
  context: CompanyContext | null,
  userId: string,
): ProjectAuthority => {
  const authority = requireActiveCompany(context, userId);
  if (!holds(context as CompanyContext, 'project.create')) throw notPermittedToCreate();
  return authority;
};

export interface ProjectAccessInput {
  readonly projectId: Types.ObjectId;
  readonly projectCompany: Types.ObjectId;
  readonly userId: Types.ObjectId;
  readonly authority: ProjectAuthority;
  readonly access: ProjectAccessRepository;
}

export interface ResolvedProjectAccess {
  /** Belonging to the owning company is what makes a project VISIBLE. It authorizes nothing. */
  readonly isOwningCompany: boolean;
  readonly projectPermissions: readonly ProjectPermission[];
  readonly fullAuthority: boolean;
}

export const resolveProjectAccess = async ({
  projectId,
  projectCompany,
  userId,
  authority,
  access,
}: ProjectAccessInput): Promise<ResolvedProjectAccess> => {
  const isOwningCompany = projectCompany.toString() === authority.companyId;
  const membership = await access.findActiveMembership(projectId, userId);

  if (!isOwningCompany && membership === null) throw projectNotFound();

  return {
    isOwningCompany,
    projectPermissions: membership === null ? [] : effectiveProjectPermissions(membership),
    fullAuthority: membership?.fullAuthority === true,
  };
};

export const mayManage = (resolved: ResolvedProjectAccess): boolean =>
  resolved.fullAuthority || resolved.projectPermissions.includes('project.edit');

/** The predicate behind the guard, so a caller that raises its own error still asks this one place. */
export const hasProjectPermission = (
  resolved: ResolvedProjectAccess,
  permission: ProjectPermission,
): boolean => resolved.fullAuthority || resolved.projectPermissions.includes(permission);

export const requireProjectPermission = (
  resolved: ResolvedProjectAccess,
  permission: ProjectPermission,
): void => {
  if (!hasProjectPermission(resolved, permission)) throw notPermittedToCreate();
};
