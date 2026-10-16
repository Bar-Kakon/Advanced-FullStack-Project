import { Schema, model, type Types } from 'mongoose';

import { PROJECT_PERMISSIONS, type ProjectPermission } from './projectPermission.js';

/**
 * A reusable bundle of grants that ONE CONTRACTOR defines for themselves, so the same set does not
 * have to be configured by hand on every project.
 *
 * It is always owned by a company. There are deliberately no built-in, system-wide templates keyed
 * to a role: a universal "site manager template" would be Blokta deciding what a job title may
 * do, which is exactly what the grant-based model exists to avoid.
 *
 * Applying a template COPIES its grants onto a membership at that moment. Editing the template
 * afterwards does not reach back into memberships already created from it — the same reasoning that
 * keeps a company calendar edit away from a live project.
 */
export interface PermissionTemplateRecord {
  readonly _id: Types.ObjectId;
  readonly company: Types.ObjectId;
  readonly name: string;
  readonly permissions: readonly ProjectPermission[];
  readonly fullAuthority: boolean;
  readonly createdBy: Types.ObjectId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const permissionTemplateSchema = new Schema(
  {
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 80 },
    permissions: [{ type: String, enum: PROJECT_PERMISSIONS }],
    fullAuthority: { type: Boolean, required: true, default: false },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

permissionTemplateSchema.index({ company: 1, name: 1 }, { unique: true });

export const PermissionTemplateModel = model('PermissionTemplate', permissionTemplateSchema);
