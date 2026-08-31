import { Types } from 'mongoose';

import type { CompanyContextService } from '../companies/companyContext.service.js';
import type { ProjectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import { projectNotFound } from '../projects/project.errors.js';
import type { ProjectRepository } from '../projects/project.repository.js';
import { requireActiveCompany } from '../projects/projectAuthorization.js';
import type { MuteRepository } from './mute.repository.js';

export interface ProjectMuteDto {
  readonly projectId: string;
  readonly muted: boolean;
}

export interface TargetMuteDto {
  readonly targetId: string;
  readonly muted: boolean;
}

export interface MuteService {
  projectMute(userId: string, projectId: string): Promise<ProjectMuteDto>;
  setProjectMute(userId: string, projectId: string, muted: boolean): Promise<ProjectMuteDto>;
  mutedProjectIds(userId: string, projectIds: readonly string[]): Promise<Set<string>>;
  conversationMute(userId: string, conversationId: string): Promise<TargetMuteDto>;
  setConversationMute(userId: string, conversationId: string, muted: boolean): Promise<TargetMuteDto>;
  contractorMute(userId: string, contractorId: string): Promise<TargetMuteDto>;
  setContractorMute(userId: string, contractorId: string, muted: boolean): Promise<TargetMuteDto>;
}

/** Reads a conversation the caller actually takes part in, or answers as though it were absent. */
export interface MuteConversationReader {
  reachable(userId: string, conversationId: string): Promise<{ _id: Types.ObjectId }>;
}

export interface MuteDependencies {
  readonly mutes: MuteRepository;
  readonly projects: ProjectRepository;
  readonly access: ProjectAccessRepository;
  readonly companyContext: CompanyContextService;
  readonly conversations: MuteConversationReader;
}

export const createMuteService = ({
  mutes,
  projects,
  access,
  companyContext,
  conversations,
}: MuteDependencies): MuteService => {
  const reachableProject = async (userId: string, projectId: string): Promise<Types.ObjectId> => {
    const authority = requireActiveCompany(await companyContext.forUser(userId), userId);
    const memberOf = await access.listActiveProjectIdsForUser(new Types.ObjectId(userId));
    const project = await projects.findAccessibleById(
      projectId,
      new Types.ObjectId(authority.companyId),
      memberOf,
    );
    if (project === null) throw projectNotFound();
    return project._id;
  };

  return {
    async projectMute(userId, projectId) {
      const project = await reachableProject(userId, projectId);
      return {
        projectId: project.toString(),
        muted: await mutes.isMuted(new Types.ObjectId(userId), 'project', project),
      };
    },

    async setProjectMute(userId, projectId, muted) {
      const project = await reachableProject(userId, projectId);
      const user = new Types.ObjectId(userId);

      if (muted) await mutes.add(user, 'project', project);
      else await mutes.remove(user, 'project', project);

      return { projectId: project.toString(), muted };
    },

    /**
     * Muting a conversation requires being in it — otherwise an id could be probed for existence
     * by whether muting it succeeded. Muting changes delivery only: the conversation stays
     * readable, its messages keep arriving, and a blocking in-app notice is never suppressed.
     */
    async conversationMute(userId, conversationId) {
      const conversation = await conversations.reachable(userId, conversationId);
      return {
        targetId: conversation._id.toString(),
        muted: await mutes.isMuted(new Types.ObjectId(userId), 'conversation', conversation._id),
      };
    },

    async setConversationMute(userId, conversationId, muted) {
      const conversation = await conversations.reachable(userId, conversationId);
      const user = new Types.ObjectId(userId);

      if (muted) await mutes.add(user, 'conversation', conversation._id);
      else await mutes.remove(user, 'conversation', conversation._id);

      return { targetId: conversation._id.toString(), muted };
    },

    /**
     * A contractor mute needs no relationship to hold: it is the caller's own preference about
     * their own notifications, and it grants the target nothing and takes nothing away. It is NOT
     * a block — the two are different rows with different meanings.
     */
    async contractorMute(userId, contractorId) {
      const target = new Types.ObjectId(contractorId);
      return {
        targetId: contractorId,
        muted: await mutes.isMuted(new Types.ObjectId(userId), 'contractor', target),
      };
    },

    async setContractorMute(userId, contractorId, muted) {
      const user = new Types.ObjectId(userId);
      const target = new Types.ObjectId(contractorId);

      if (muted) await mutes.add(user, 'contractor', target);
      else await mutes.remove(user, 'contractor', target);

      return { targetId: contractorId, muted };
    },

    async mutedProjectIds(userId, projectIds) {
      const ids = projectIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
      return mutes.mutedTargets(new Types.ObjectId(userId), 'project', ids);
    },
  };
};
