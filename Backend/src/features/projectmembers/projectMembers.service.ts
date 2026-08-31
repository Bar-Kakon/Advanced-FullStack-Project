import { Types } from 'mongoose';

import type { BlocksService } from '../blocks/blocks.service.js';
import type { CompanyContextService } from '../companies/companyContext.service.js';
import type { NotificationDispatchService } from '../notifications/notificationDispatch.service.js';
import { resolveGrantSource, type GrantSource } from '../projectaccess/grantResolution.js';
import { cannotRemoveOwnAuthority } from '../projectaccess/permissions.errors.js';
import type { PermissionTemplateRepository } from '../projectaccess/permissionTemplate.repository.js';
import type { ProjectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import type { ProjectGrantRepository } from '../projectaccess/projectGrant.repository.js';
import {
  PROJECT_ROLES,
  type ProjectMembershipRecord,
  type ProjectRole,
} from '../projectaccess/projectMembership.model.js';
import { PROJECT_PERMISSIONS, type ProjectPermission } from '../projectaccess/projectPermission.js';
import { projectNotFound } from '../projects/project.errors.js';
import type { ProjectRepository } from '../projects/project.repository.js';
import {
  requireActiveCompany,
  requireProjectPermission,
  resolveProjectAccess,
  type ResolvedProjectAccess,
} from '../projects/projectAuthorization.js';
import type { ProjectMemberDto, ProjectMembersDto } from './projectMember.dto.js';
import {
  alreadyOnProject,
  cannotInviteSelf,
  membershipNotFound,
  participantBlocked,
  participantNotFound,
} from './projectMembers.errors.js';
import type { ParticipantRepository } from './participant.repository.js';

export interface InviteMemberInput extends GrantSource {
  readonly userId: string;
  readonly projectRole: ProjectRole;
}

export interface ProjectMembersService {
  list(userId: string, projectId: string): Promise<ProjectMembersDto>;
  invite(userId: string, projectId: string, input: InviteMemberInput): Promise<ProjectMemberDto>;
  setRole(userId: string, projectId: string, membershipId: string, projectRole: ProjectRole): Promise<ProjectMemberDto>;
  remove(userId: string, projectId: string, membershipId: string): Promise<void>;
}

export interface ProjectMembersDependencies {
  readonly projects: ProjectRepository;
  readonly companyContext: CompanyContextService;
  readonly access: ProjectAccessRepository;
  readonly grants: ProjectGrantRepository;
  readonly templates: PermissionTemplateRepository;
  readonly participants: ParticipantRepository;
  readonly blocks: BlocksService;
  readonly notifications: NotificationDispatchService;
}

const holds = (resolved: ResolvedProjectAccess, permission: ProjectPermission): boolean =>
  resolved.fullAuthority || resolved.projectPermissions.includes(permission);

export const createProjectMembersService = ({
  projects,
  companyContext,
  access,
  grants,
  templates,
  participants,
  blocks,
  notifications,
}: ProjectMembersDependencies): ProjectMembersService => {
  /**
   * Loads a project this caller may reach and what they may do on it. A project they may not reach
   * answers exactly as one that does not exist (D16).
   */
  const load = async (userId: string, projectId: string) => {
    const authority = requireActiveCompany(await companyContext.forUser(userId), userId);
    const memberOf = await access.listActiveProjectIdsForUser(new Types.ObjectId(userId));

    const project = await projects.findAccessibleById(
      projectId,
      new Types.ObjectId(authority.companyId),
      memberOf,
    );
    if (project === null) throw projectNotFound();

    const resolved = await resolveProjectAccess({
      projectId: project._id,
      projectCompany: project.company,
      userId: new Types.ObjectId(userId),
      authority,
      access,
    });

    return { authority, project, resolved };
  };

  /** Reads a row and proves it belongs to the project the route named, never to another one. */
  const loadRow = async (projectId: Types.ObjectId, membershipId: string) => {
    const row = await grants.findById(membershipId);
    if (row === null || row.project.toString() !== projectId.toString()) throw membershipNotFound();
    return row;
  };

  const directory = async (rows: readonly ProjectMembershipRecord[]) => {
    const ids = [...new Set(rows.flatMap((row) => [row.user.toString(), row.invitedBy.toString()]))];
    const people = await participants.findByIds(ids.map((id) => new Types.ObjectId(id)));
    return new Map(people.map((person) => [person._id.toString(), person]));
  };

  const toMemberDto = (
    row: ProjectMembershipRecord,
    people: Awaited<ReturnType<typeof directory>>,
    viewerId: string,
    showAuthority: boolean,
  ): ProjectMemberDto => {
    const person = people.get(row.user.toString());
    const inviter = people.get(row.invitedBy.toString());

    return {
      id: row._id.toString(),
      userId: row.user.toString(),
      name: person === undefined ? '' : `${person.firstName} ${person.lastName}`.trim(),
      companyName: person?.companyName ?? null,
      status: row.status,
      projectRole: row.projectRole,
      permissions: showAuthority ? row.permissions : null,
      fullAuthority: showAuthority ? row.fullAuthority : null,
      invitedByName: inviter === undefined ? null : `${inviter.firstName} ${inviter.lastName}`.trim(),
      invitedAt: row.invitedAt.toISOString(),
      isViewer: row.user.toString() === viewerId,
    };
  };

  return {
    async list(userId, projectId) {
      const { project, resolved } = await load(userId, projectId);
      const rows = await access.listMembers(project._id);
      const people = await directory(rows);
      const showAuthority = holds(resolved, 'project.permission.grant');

      const of = (status: ProjectMembershipRecord['status']) =>
        rows
          .filter((row) => row.status === status)
          .map((row) => toMemberDto(row, people, userId, showAuthority));

      return {
        projectId: project._id.toString(),
        projectName: project.name,
        members: of('active'),
        invitations: of('invited'),
        viewer: {
          canInvite: holds(resolved, 'project.member.invite'),
          canManageMembers: holds(resolved, 'project.member.manage'),
          canGrantPermissions: showAuthority,
        },
        allPermissions: PROJECT_PERMISSIONS,
        allRoles: PROJECT_ROLES,
      };
    },

    async invite(userId, projectId, input) {
      const { authority, project, resolved } = await load(userId, projectId);
      requireProjectPermission(resolved, 'project.member.invite');

      const wantsAuthority =
        input.fullAuthority === true ||
        (input.permissions?.length ?? 0) > 0 ||
        input.templateId !== undefined ||
        input.copyFromGrantId !== undefined;
      // Handing out authority is a second right. Inviting alone never confers the power to grant.
      if (wantsAuthority) requireProjectPermission(resolved, 'project.permission.grant');

      if (input.userId === userId) throw cannotInviteSelf();
      if (!Types.ObjectId.isValid(input.userId)) throw participantNotFound();
      const invitee = new Types.ObjectId(input.userId);
      if (!(await participants.exists(invitee))) throw participantNotFound();

      const hidden = await blocks.hiddenUserIdsFor(userId);
      if (hidden.some((id) => id.toString() === input.userId)) throw participantBlocked();

      const existing = await access.findMembership(project._id, invitee);
      if (existing !== null && (existing.status === 'invited' || existing.status === 'active')) {
        throw alreadyOnProject();
      }

      const { permissions, fullAuthority } = await resolveGrantSource(input, {
        companyId: authority.companyId,
        projectId: project._id,
        templates,
        grants,
      });

      // Attribution is the invitee's OWN business, never the project's. It grants nothing either way.
      const [person] = await participants.findByIds([invitee]);

      const created = await grants.invite({
        project: project._id,
        user: invitee,
        ...(person?.companyId ? { company: person.companyId } : {}),
        projectRole: input.projectRole,
        permissions,
        fullAuthority,
        invitedBy: new Types.ObjectId(userId),
      });

      // The invitation reaches the person invited and nobody else: until it is answered it is a
      // matter between the project and one professional.
      await notifications.emit({
        userId: invitee,
        type: 'project.invitation',
        projectId: project._id,
        payload: { projectName: project.name },
        dedupeKey: `project.invitation:${created._id.toString()}`,
      });

      const people = await directory([created]);
      return toMemberDto(created, people, userId, holds(resolved, 'project.permission.grant'));
    },

    async setRole(userId, projectId, membershipId, projectRole) {
      const { project, resolved } = await load(userId, projectId);
      requireProjectPermission(resolved, 'project.member.manage');

      const row = await loadRow(project._id, membershipId);
      const updated = await grants.update(row._id, { projectRole });
      if (updated === null) throw membershipNotFound();

      const people = await directory([updated]);
      return toMemberDto(updated, people, userId, holds(resolved, 'project.permission.grant'));
    },

    async remove(userId, projectId, membershipId) {
      const { project, resolved } = await load(userId, projectId);
      const row = await loadRow(project._id, membershipId);

      // Withdrawing an offer belongs to whoever may make one; removing a member does not.
      if (row.status === 'invited' && !holds(resolved, 'project.member.manage')) {
        requireProjectPermission(resolved, 'project.member.invite');
      } else {
        requireProjectPermission(resolved, 'project.member.manage');
      }

      if (row.user.toString() === userId) throw cannotRemoveOwnAuthority();
      await grants.revoke(row._id);
    },
  };
};
