import { Types } from 'mongoose';

import type { CompanyContextService } from '../companies/companyContext.service.js';
import type { ProjectRepository } from '../projects/project.repository.js';
import { noActiveCompany, notPermittedToCreate, projectNotFound } from '../projects/project.errors.js';
import { requireActiveCompany, resolveProjectAccess } from '../projects/projectAuthorization.js';
import type { ProjectAccessRepository } from './projectAccess.repository.js';
import type { GrantUpdate, ProjectGrantRepository } from './projectGrant.repository.js';
import type { PermissionTemplateRepository } from './permissionTemplate.repository.js';
import { resolveGrantSource, type GrantSource } from './grantResolution.js';
import { PROJECT_PERMISSIONS, type ProjectPermission } from './projectPermission.js';
import type { ProjectRole } from './projectMembership.model.js';
import { cannotRemoveOwnAuthority, templateNameTaken, templateNotFound } from './permissions.errors.js';

export interface GrantDto {
  readonly id: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly userId: string;
  readonly status: string;
  readonly projectRole: ProjectRole;
  readonly permissions: readonly ProjectPermission[];
  readonly fullAuthority: boolean;
}

export interface TemplateDto {
  readonly id: string;
  readonly name: string;
  readonly permissions: readonly ProjectPermission[];
  readonly fullAuthority: boolean;
}

export interface PermissionsOverviewDto {
  /** Only projects this caller may administer — the same rows the project surface would show. */
  readonly projects: readonly { readonly id: string; readonly name: string }[];
  readonly grants: readonly GrantDto[];
  readonly templates: readonly TemplateDto[];
  readonly allPermissions: readonly ProjectPermission[];
}

export interface PermissionsService {
  overview(userId: string): Promise<PermissionsOverviewDto>;
  grant(userId: string, input: GrantInput): Promise<GrantDto>;
  updateGrant(userId: string, grantId: string, update: GrantUpdate): Promise<GrantDto>;
  revokeGrant(userId: string, grantId: string): Promise<void>;
  listTemplates(userId: string): Promise<readonly TemplateDto[]>;
  createTemplate(userId: string, name: string, permissions: readonly ProjectPermission[], fullAuthority: boolean): Promise<TemplateDto>;
  deleteTemplate(userId: string, templateId: string): Promise<void>;
}

export interface GrantInput extends GrantSource {
  readonly projectId: string;
  readonly userId: string;
  readonly projectRole: ProjectRole;
}

export interface PermissionsDependencies {
  readonly companyContext: CompanyContextService;
  readonly projects: ProjectRepository;
  readonly access: ProjectAccessRepository;
  readonly grants: ProjectGrantRepository;
  readonly templates: PermissionTemplateRepository;
}

export const createPermissionsService = ({
  companyContext,
  projects,
  access,
  grants,
  templates,
}: PermissionsDependencies): PermissionsService => {
  const contextFor = async (userId: string) => {
    const context = await companyContext.forUser(userId);
    return { context, authority: requireActiveCompany(context, userId) };
  };

  /** The projects this caller may administer, from their project grants — never company-wide. */
  const administrable = async (userId: string) => {
    const { authority } = await contextFor(userId);
    const memberships = await access.listActiveMembershipsForUser(new Types.ObjectId(userId));
    const allowed = memberships.filter(
      (m) => m.fullAuthority || m.permissions.includes('project.permission.grant'),
    );

    const rows = await projects.listAccessible(
      new Types.ObjectId(authority.companyId),
      allowed.map((m) => m.project),
      null,
      200,
    );
    const allowedIds = new Set(allowed.map((m) => m.project.toString()));

    return {
      authority,
      projects: rows.filter((row) => allowedIds.has(row._id.toString())),
    };
  };

  const requireGrantAuthority = async (userId: string, projectId: Types.ObjectId) => {
    const { authority } = await contextFor(userId);
    const project = await projects.findAccessibleById(
      projectId.toString(),
      new Types.ObjectId(authority.companyId),
      [projectId],
    );
    if (project === null) throw projectNotFound();

    const resolved = await resolveProjectAccess({
      projectId: project._id,
      projectCompany: project.company,
      userId: new Types.ObjectId(userId),
      authority,
      access,
    });
    if (!resolved.fullAuthority && !resolved.projectPermissions.includes('project.permission.grant')) {
      throw notPermittedToCreate();
    }
    return { authority, project };
  };

  const toGrantDto = (
    row: { _id: Types.ObjectId; project: Types.ObjectId; user: Types.ObjectId; status: string; projectRole: ProjectRole; permissions: readonly ProjectPermission[]; fullAuthority: boolean },
    projectName: string,
  ): GrantDto => ({
    id: row._id.toString(),
    projectId: row.project.toString(),
    projectName,
    userId: row.user.toString(),
    status: row.status,
    projectRole: row.projectRole,
    permissions: row.permissions,
    fullAuthority: row.fullAuthority,
  });

  return {
    async overview(userId) {
      const { authority, projects: rows } = await administrable(userId);
      const names = new Map(rows.map((row) => [row._id.toString(), row.name]));
      const all = await grants.listForProjects(rows.map((row) => row._id));

      return {
        projects: rows.map((row) => ({ id: row._id.toString(), name: row.name })),
        grants: all.map((row) => toGrantDto(row, names.get(row.project.toString()) ?? '')),
        templates: (await templates.listByCompany(new Types.ObjectId(authority.companyId))).map((t) => ({
          id: t._id.toString(),
          name: t.name,
          permissions: t.permissions,
          fullAuthority: t.fullAuthority,
        })),
        allPermissions: PROJECT_PERMISSIONS,
      };
    },

    async grant(userId, input) {
      if (!Types.ObjectId.isValid(input.projectId)) throw projectNotFound();
      const projectId = new Types.ObjectId(input.projectId);
      const { authority, project } = await requireGrantAuthority(userId, projectId);

      const { permissions, fullAuthority } = await resolveGrantSource(input, {
        companyId: authority.companyId,
        projectId,
        templates,
        grants,
      });

      const user = new Types.ObjectId(input.userId);
      const shared = {
        project: projectId,
        user,
        projectRole: input.projectRole,
        permissions,
        fullAuthority,
        invitedBy: new Types.ObjectId(userId),
      };

      // Somebody who refused or was removed comes back through an invitation they answer
      // themselves, so a grant can never quietly put a person back on a project.
      const existing = await access.findMembership(projectId, user);
      const created =
        existing !== null && (existing.status === 'declined' || existing.status === 'removed')
          ? await grants.invite(shared)
          : await grants.upsert({ ...shared, status: 'active' });

      return toGrantDto(created, project.name);
    },

    async updateGrant(userId, grantId, update) {
      const existing = await grants.findById(grantId);
      if (existing === null) throw projectNotFound();
      const { project } = await requireGrantAuthority(userId, existing.project);

      if (existing.user.toString() === userId) {
        const keepsFull = update.fullAuthority ?? existing.fullAuthority;
        const keepsGrant = (update.permissions ?? existing.permissions).includes(
          'project.permission.grant',
        );
        if (!keepsFull && !keepsGrant) throw cannotRemoveOwnAuthority();
      }

      const updated = await grants.update(existing._id, update);
      if (updated === null) throw projectNotFound();
      return toGrantDto(updated, project.name);
    },

    async revokeGrant(userId, grantId) {
      const existing = await grants.findById(grantId);
      if (existing === null) throw projectNotFound();
      await requireGrantAuthority(userId, existing.project);
      if (existing.user.toString() === userId) throw cannotRemoveOwnAuthority();
      await grants.revoke(existing._id);
    },

    async listTemplates(userId) {
      const { authority } = await contextFor(userId);
      const rows = await templates.listByCompany(new Types.ObjectId(authority.companyId));
      return rows.map((t) => ({
        id: t._id.toString(),
        name: t.name,
        permissions: t.permissions,
        fullAuthority: t.fullAuthority,
      }));
    },

    async createTemplate(userId, name, permissions, fullAuthority) {
      const { context, authority } = await contextFor(userId);
      if (context === null) throw noActiveCompany();

      const created = await templates.create({
        company: new Types.ObjectId(authority.companyId),
        name,
        permissions,
        fullAuthority,
        createdBy: new Types.ObjectId(userId),
      });
      if (created === null) throw templateNameTaken();

      return {
        id: created._id.toString(),
        name: created.name,
        permissions: created.permissions,
        fullAuthority: created.fullAuthority,
      };
    },

    async deleteTemplate(userId, templateId) {
      const { authority } = await contextFor(userId);
      const removed = await templates.remove(templateId, new Types.ObjectId(authority.companyId));
      if (!removed) throw templateNotFound();
    },
  };
};
