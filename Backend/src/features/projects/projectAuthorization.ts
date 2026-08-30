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
 * Seven concepts stay separate, and none is collapsed into a role field:
 *
 *   createdBy            provenance — who filled the form. Grants nothing, ever.
 *   company membership   belonging to a business
 *   companyPosition      a job title. Never read by anything below.
 *   project membership   participating in one job
 *   projectRole          descriptive. Never read by anything below.
 *   permissions[]        individual grants
 *   fullAuthority        the "all of it, including later additions" grant
 *
 * Work delegation (D7) is an eighth mechanism and is not an input to any decision here.
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
  readonly authority: ProjectAuthority;
  readonly companyContext: CompanyContext;
  readonly access: ProjectAccessRepository;
}

export interface ResolvedProjectAccess {
  /** True when the caller belongs to the business that owns the project. */
  readonly isOwningCompany: boolean;
  readonly projectPermissions: readonly ProjectPermission[];
  readonly fullAuthority: boolean;
}

/**
 * What this caller may do on this project, from both sources at once: the company that owns it, and
 * an explicit project grant for somebody invited in from outside.
 *
 * A participant from another business is reached ONLY through their project membership — never
 * because of their company position, and never because they are a Main Contractor somewhere else.
 * Every project stands on its own.
 */
export const resolveProjectAccess = async ({
  projectId,
  projectCompany,
  authority,
  companyContext,
  access,
}: ProjectAccessInput): Promise<ResolvedProjectAccess> => {
  const isOwningCompany = projectCompany.toString() === authority.companyId;

  const membership = await access.findActiveMembership(
    projectId,
    new (projectId.constructor as typeof Types.ObjectId)(authority.userId),
  );

  if (!isOwningCompany && membership === null) throw projectNotFound();

  // The owning company's project.create grant is what governs managing its own projects, since no
  // finer-grained company permission exists. A guest's authority comes only from their grant.
  const owningCompanyManages = isOwningCompany && holds(companyContext, 'project.create');

  const granted = membership === null ? [] : effectiveProjectPermissions(membership);
  const fullAuthority = membership?.fullAuthority === true;

  return {
    isOwningCompany,
    projectPermissions: owningCompanyManages
      ? [...new Set([...granted, 'project.edit', 'project.cancel', 'project.calendar.manage'] as ProjectPermission[])]
      : granted,
    fullAuthority: fullAuthority || owningCompanyManages,
  };
};

export const requireProjectPermission = (
  resolved: ResolvedProjectAccess,
  permission: ProjectPermission,
): void => {
  if (resolved.fullAuthority) return;
  if (!resolved.projectPermissions.includes(permission)) throw notPermittedToCreate();
};
