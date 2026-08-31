import { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import {
  ProjectMembershipModel,
  type ProjectMembershipRecord,
  type ProjectMembershipStatus,
  type ProjectRole,
} from './projectMembership.model.js';
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
  invite(grant: Omit<NewGrant, 'status'>): Promise<ProjectMembershipRecord>;
  findById(id: string): Promise<ProjectMembershipRecord | null>;
  update(id: Types.ObjectId, update: GrantUpdate): Promise<ProjectMembershipRecord | null>;
  respond(
    id: Types.ObjectId,
    status: Extract<ProjectMembershipStatus, 'active' | 'declined'>,
    session?: DbSession,
  ): Promise<ProjectMembershipRecord | null>;
  revoke(id: Types.ObjectId): Promise<boolean>;
  /** A cancelled project takes its memberships and open invitations with it. */
  deleteByProject(project: Types.ObjectId): Promise<number>;
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
        },
        // An existing row keeps the status it earned; editing a grant never answers an invitation.
        $setOnInsert: {
          status: grant.status,
          invitedBy: grant.invitedBy,
          invitedAt: new Date(),
          ...(grant.company ? { company: grant.company } : {}),
        },
      },
      { new: true, upsert: true },
    )
      .lean<ProjectMembershipRecord>()
      .exec();

    return updated as ProjectMembershipRecord;
  },

  /** Re-inviting a declined or removed person reuses the row and records the new offer. */
  async invite(grant) {
    const updated = await ProjectMembershipModel.findOneAndUpdate(
      { project: grant.project, user: grant.user },
      {
        $set: {
          projectRole: grant.projectRole,
          permissions: [...grant.permissions],
          fullAuthority: grant.fullAuthority,
          status: 'invited',
          invitedBy: grant.invitedBy,
          invitedAt: new Date(),
          ...(grant.company ? { company: grant.company } : {}),
        },
        $unset: { respondedAt: '' },
      },
      { new: true, upsert: true },
    )
      .lean<ProjectMembershipRecord>()
      .exec();

    return updated as ProjectMembershipRecord;
  },

  /** Only an open invitation may be answered, so a double submit cannot revive a removed row. */
  async respond(id, status, session) {
    return ProjectMembershipModel.findOneAndUpdate(
      { _id: id, status: 'invited' },
      { $set: { status, respondedAt: new Date() } },
      { new: true, ...(session ? { session } : {}) },
    )
      .lean<ProjectMembershipRecord>()
      .exec();
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

  async deleteByProject(project) {
    const result = await ProjectMembershipModel.deleteMany({ project }).exec();
    return result.deletedCount;
  },

  async listForProjects(projects) {
    if (projects.length === 0) return [];
    return ProjectMembershipModel.find({ project: { $in: [...projects] } })
      .sort({ createdAt: 1 })
      .lean<ProjectMembershipRecord[]>()
      .exec();
  },
};
