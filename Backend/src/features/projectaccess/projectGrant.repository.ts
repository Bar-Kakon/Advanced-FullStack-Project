import { Types } from 'mongoose';

import { ProjectMembershipModel, type ProjectMembershipRecord, type ProjectRole } from './projectMembership.model.js';
import type { ProjectPermission } from './projectPermission.js';

export interface NewGrant {
  readonly project: Types.ObjectId;
  readonly user: Types.ObjectId;
  readonly company?: Types.ObjectId;
  readonly projectRole: ProjectRole;
  readonly permissions: readonly ProjectPermission[];
  readonly fullAuthority: boolean;
  readonly invitedBy: Types.ObjectId;
  readonly status: 'invited' | 'active';
}

export interface GrantUpdate {
  readonly projectRole?: ProjectRole;
  readonly permissions?: readonly ProjectPermission[];
  readonly fullAuthority?: boolean;
}

export interface ProjectGrantRepository {
  upsert(grant: NewGrant): Promise<ProjectMembershipRecord>;
  findById(id: string): Promise<ProjectMembershipRecord | null>;
  update(id: Types.ObjectId, update: GrantUpdate): Promise<ProjectMembershipRecord | null>;
  revoke(id: Types.ObjectId): Promise<boolean>;
  listForProjects(projects: readonly Types.ObjectId[]): Promise<ProjectMembershipRecord[]>;
}

export const projectGrantRepository: ProjectGrantRepository = {
  /** One row per person per project, so granting twice edits rather than duplicating. */
  async upsert(grant) {
    const updated = await ProjectMembershipModel.findOneAndUpdate(
      { project: grant.project, user: grant.user },
      {
        $set: {
          projectRole: grant.projectRole,
          permissions: [...grant.permissions],
          fullAuthority: grant.fullAuthority,
          status: grant.status,
        },
        $setOnInsert: {
          invitedBy: grant.invitedBy,
          ...(grant.company ? { company: grant.company } : {}),
        },
      },
      { new: true, upsert: true },
    )
      .lean<ProjectMembershipRecord>()
      .exec();

    return updated as ProjectMembershipRecord;
  },

  async findById(id) {
    if (!Types.ObjectId.isValid(id)) return null;
    return ProjectMembershipModel.findById(new Types.ObjectId(id))
      .lean<ProjectMembershipRecord>()
      .exec();
  },

  async update(id, update) {
    const set: Record<string, unknown> = {};
    if (update.projectRole !== undefined) set['projectRole'] = update.projectRole;
    if (update.permissions !== undefined) set['permissions'] = [...update.permissions];
    if (update.fullAuthority !== undefined) set['fullAuthority'] = update.fullAuthority;

    return ProjectMembershipModel.findByIdAndUpdate(id, { $set: set }, { new: true })
      .lean<ProjectMembershipRecord>()
      .exec();
  },

  /** Revoking keeps the row as history rather than deleting who was once involved. */
  async revoke(id) {
    const result = await ProjectMembershipModel.updateOne(
      { _id: id },
      { $set: { status: 'removed', permissions: [], fullAuthority: false } },
    ).exec();
    return result.matchedCount === 1;
  },

  async listForProjects(projects) {
    if (projects.length === 0) return [];
    return ProjectMembershipModel.find({ project: { $in: [...projects] } })
      .sort({ createdAt: 1 })
      .lean<ProjectMembershipRecord[]>()
      .exec();
  },
};
