import type { CompanyContext } from '../companies/companyContext.service.js';
import type { CompanyPermission } from '../companies/companyMembership.model.js';
import { noActiveCompany, notPermittedToCreate } from './project.errors.js';

/**
 * Every project authority question is answered here and nowhere else.
 *
 * Three separations the rest of the system depends on, kept deliberately:
 *
 *   company position  — a job title. Grants nothing, and is never read here.
 *   membership        — that a person belongs to a company at all.
 *   granted permission— what they may actually do. This is the only input to a decision.
 *
 * Nothing below branches on `standing` or `companyPosition`, so authority stays something granted
 * rather than something a role name implies. When project-scoped grants exist, they are consulted
 * at these same call sites — the service does not gain new checks of its own.
 */
export interface ProjectAuthority {
  /** The company a request acts in, taken from the session and never from a request body. */
  readonly companyId: string;
}

const isActiveMember = (context: CompanyContext | null): context is CompanyContext =>
  context !== null && context.membershipStatus === 'active';

const holds = (context: CompanyContext, permission: CompanyPermission): boolean =>
  context.permissions.includes(permission);

export const requireActiveCompany = (context: CompanyContext | null): ProjectAuthority => {
  if (!isActiveMember(context)) throw noActiveCompany();
  return { companyId: context.id };
};

export const requireMayCreateProject = (context: CompanyContext | null): ProjectAuthority => {
  const authority = requireActiveCompany(context);
  if (!holds(context as CompanyContext, 'project.create')) throw notPermittedToCreate();
  return authority;
};

/**
 * Reading is open to any active member of the owning company: a project is company work, and the
 * row is already filtered by company before this is reached.
 */
export const requireMayReadProjects = requireActiveCompany;

/**
 * Editing and cancelling are gated on the same granted permission that governs creating them,
 * because no finer-grained project permission has been defined. This reads a GRANT, not a role —
 * so when the permissions model adds a project-scoped grant, this function changes and no call
 * site does.
 */
export const requireMayManageProject = requireMayCreateProject;
