import { Types } from 'mongoose';

import type { ProjectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import type { ProjectGrantRepository } from '../projectaccess/projectGrant.repository.js';
import type { ProjectRepository } from '../projects/project.repository.js';
import { formatCalendarDate } from '../projects/projectDates.js';
import type { ProjectInvitationDto } from './projectMember.dto.js';
import { invitationNotOpen, membershipNotFound } from './projectMembers.errors.js';
import type { ParticipantRepository } from './participant.repository.js';

export interface ProjectInvitationsService {
  listMine(userId: string): Promise<readonly ProjectInvitationDto[]>;
  accept(userId: string, membershipId: string): Promise<void>;
  decline(userId: string, membershipId: string): Promise<void>;
}

export interface ProjectInvitationsDependencies {
  readonly projects: ProjectRepository;
  readonly access: ProjectAccessRepository;
  readonly grants: ProjectGrantRepository;
  readonly participants: ParticipantRepository;
}

export const createProjectInvitationsService = ({
  projects,
  access,
  grants,
  participants,
}: ProjectInvitationsDependencies): ProjectInvitationsService => {
  /** An invitation another account holds answers as one that does not exist (D16). */
  const loadOwn = async (userId: string, membershipId: string) => {
    const row = await grants.findById(membershipId);
    if (row === null || row.user.toString() !== userId) throw membershipNotFound();
    if (row.status !== 'invited') throw invitationNotOpen();
    return row;
  };

  return {
    async listMine(userId) {
      const rows = await access.listInvitationsForUser(new Types.ObjectId(userId));
      if (rows.length === 0) return [];

      const found = await projects.listByIds(rows.map((row) => row.project));
      const byId = new Map(found.map((project) => [project._id.toString(), project]));
      const people = await participants.findByIds(rows.map((row) => row.invitedBy));
      const inviters = new Map(people.map((person) => [person._id.toString(), person]));

      return rows.flatMap((row) => {
        // A cancelled project takes its invitations with it; a dangling row is simply not offered.
        const project = byId.get(row.project.toString());
        if (project === undefined) return [];
        const inviter = inviters.get(row.invitedBy.toString());

        return [
          {
            id: row._id.toString(),
            projectId: project._id.toString(),
            projectName: project.name,
            projectType: project.projectType,
            projectTypeOther: project.projectTypeOther ?? null,
            city: project.location?.city ?? null,
            startDate: formatCalendarDate(project.startDate),
            targetEndDate: formatCalendarDate(project.targetEndDate),
            invitedByName:
              inviter === undefined ? null : `${inviter.firstName} ${inviter.lastName}`.trim(),
            projectRole: row.projectRole,
            invitedAt: row.invitedAt.toISOString(),
          },
        ];
      });
    },

    async accept(userId, membershipId) {
      const row = await loadOwn(userId, membershipId);
      if ((await grants.respond(row._id, 'active')) === null) throw invitationNotOpen();
    },

    async decline(userId, membershipId) {
      const row = await loadOwn(userId, membershipId);
      if ((await grants.respond(row._id, 'declined')) === null) throw invitationNotOpen();
    },
  };
};
