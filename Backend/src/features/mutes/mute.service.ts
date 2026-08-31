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

export interface MuteService {
  projectMute(userId: string, projectId: string): Promise<ProjectMuteDto>;
  setProjectMute(userId: string, projectId: string, muted: boolean): Promise<ProjectMuteDto>;
  mutedProjectIds(userId: string, projectIds: readonly string[]): Promise<Set<string>>;
}

export interface MuteDependencies {
  readonly mutes: MuteRepository;
  readonly projects: ProjectRepository;
  readonly access: ProjectAccessRepository;
  readonly companyContext: CompanyContextService;
}

export const createMuteService = ({
  mutes,
  projects,
  access,
  companyContext,
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

    async mutedProjectIds(userId, projectIds) {
      const ids = projectIds.filter((id) => Types.ObjectId.isValid(id)).map((id) => new Types.ObjectId(id));
      return mutes.mutedTargets(new Types.ObjectId(userId), 'project', ids);
    },
  };
};
