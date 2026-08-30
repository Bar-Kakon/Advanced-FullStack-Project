import { Types } from 'mongoose';

import { ProjectMembershipModel, type ProjectMembershipRecord } from './projectMembership.model.js';

export interface ProjectAccessRepository {
  findActiveMembership(project: Types.ObjectId, user: Types.ObjectId): Promise<ProjectMembershipRecord | null>;
  listActiveProjectIdsForUser(user: Types.ObjectId): Promise<Types.ObjectId[]>;
  /** One read for a whole page, so a row never costs a query of its own. */
  listActiveMembershipsForUser(user: Types.ObjectId): Promise<ProjectMembershipRecord[]>;
  listMembers(project: Types.ObjectId): Promise<ProjectMembershipRecord[]>;
  /** Any status, so a declined or removed row is found rather than duplicated. */
  findMembership(project: Types.ObjectId, user: Types.ObjectId): Promise<ProjectMembershipRecord | null>;
  listInvitationsForUser(user: Types.ObjectId): Promise<ProjectMembershipRecord[]>;
}

export const projectAccessRepository: ProjectAccessRepository = {
  async findActiveMembership(project, user) {
    return ProjectMembershipModel.findOne({ project, user, status: 'active' })
      .lean<ProjectMembershipRecord>()
      .exec();
  },

  async listActiveProjectIdsForUser(user) {
    const rows = await ProjectMembershipModel.find({ user, status: 'active' })
      .select('project')
      .lean<{ project: Types.ObjectId }[]>()
      .exec();
    return rows.map((row) => row.project);
  },

  async listActiveMembershipsForUser(user) {
    return ProjectMembershipModel.find({ user, status: 'active' })
      .lean<ProjectMembershipRecord[]>()
      .exec();
  },

  async listMembers(project) {
    return ProjectMembershipModel.find({ project })
      .sort({ createdAt: 1 })
      .lean<ProjectMembershipRecord[]>()
      .exec();
  },

  async findMembership(project, user) {
    return ProjectMembershipModel.findOne({ project, user })
      .lean<ProjectMembershipRecord>()
      .exec();
  },

  async listInvitationsForUser(user) {
    return ProjectMembershipModel.find({ user, status: 'invited' })
      .sort({ invitedAt: -1 })
      .lean<ProjectMembershipRecord[]>()
      .exec();
  },
};
