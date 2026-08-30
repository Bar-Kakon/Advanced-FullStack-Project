import { Schema, model, type Types } from 'mongoose';

import { PROJECT_PERMISSIONS, type ProjectPermission } from './projectPermission.js';

/**
 * One person's participation in one project, and what they may do there.
 *
 * Six things are kept apart on purpose and none of them is collapsed into a role field:
 *
 *   createdBy (on the project) who set it up — provenance, never authority
 *   this document              that a person participates at all
 *   companyPosition            a job title on a company membership, elsewhere entirely
 *   projectRole               what they are doing here, descriptive
 *   permissions[]              individual grants
 *   fullAuthority              the "all of it, including what is added later" grant
 *
 * Work delegation (D7) is a seventh mechanism and lives nowhere near this document.
 */
export const PROJECT_MEMBERSHIP_STATUSES = ['invited', 'active', 'removed'] as const;
export type ProjectMembershipStatus = (typeof PROJECT_MEMBERSHIP_STATUSES)[number];

/** Descriptive only. It grants nothing — every capability comes from the two grant fields. */
export const PROJECT_ROLES = ['main_contractor', 'subcontractor', 'professional', 'supplier', 'viewer'] as const;
export type ProjectRole = (typeof PROJECT_ROLES)[number];

export interface ProjectMembershipRecord {
  readonly _id: Types.ObjectId;
  readonly project: Types.ObjectId;
  readonly user: Types.ObjectId;
  /** The business the participant acts through, when they have one. */
  readonly company?: Types.ObjectId;
  readonly status: ProjectMembershipStatus;
  readonly projectRole: ProjectRole;
  readonly permissions: readonly ProjectPermission[];
  readonly fullAuthority: boolean;
  readonly invitedBy: Types.ObjectId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const projectMembershipSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company' },

    status: { type: String, enum: PROJECT_MEMBERSHIP_STATUSES, required: true, default: 'invited' },
    projectRole: { type: String, enum: PROJECT_ROLES, required: true, default: 'professional' },

    permissions: [{ type: String, enum: PROJECT_PERMISSIONS }],
    // Never expanded into `permissions`, so it keeps meaning "all of them, including later ones".
    fullAuthority: { type: Boolean, required: true, default: false },

    invitedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

projectMembershipSchema.index({ project: 1, user: 1 }, { unique: true });

export const ProjectMembershipModel = model('ProjectMembership', projectMembershipSchema);
