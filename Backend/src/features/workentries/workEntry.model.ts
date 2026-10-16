import { Schema, model, type Types } from 'mongoose';

/**
 * One completed-work entry on a contractor's profile.
 *
 * Two kinds are legitimate and the schema requires neither link: a **Blokta-linked** entry
 * references work coordinated on the platform, and a **free-standing** entry is portfolio work
 * done anywhere else, including before the account existed.
 *
 * D13's storage question — a collection of its own versus an embedded array on the user — is
 * open; this collection is one of the two options it names, chosen because the feature had to be
 * built. See the report.
 */
export interface WorkEntryRecord {
  readonly _id: Types.ObjectId;
  readonly owner: Types.ObjectId;
  readonly title: string;
  readonly scope?: string;
  readonly meta: string;
  /** Optional by rule: a portfolio entry needs no platform link. */
  readonly project?: Types.ObjectId;
  readonly task?: Types.ObjectId;
  /**
   * Server-derived only. It is never read from a request body, and it can only be true for a
   * linked entry whose completion the server proved.
   */
  readonly fieldSyncVerifiedAt?: Date;
  readonly image?: Types.ObjectId;
  readonly createdAt: Date;
}

const workEntrySchema = new Schema(
  {
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, trim: true, maxlength: 120 },
    scope: { type: String, trim: true, maxlength: 160 },
    meta: { type: String, required: true, trim: true, maxlength: 120 },

    project: { type: Schema.Types.ObjectId, ref: 'Project' },
    task: { type: Schema.Types.ObjectId, ref: 'Task' },

    // Written by the server when it has proved the linked work complete, and by nothing else.
    fieldSyncVerifiedAt: { type: Date },

    image: { type: Schema.Types.ObjectId, ref: 'FileAsset' },
  },
  { timestamps: true },
);

// The profile reads one contractor's entries, newest first.
workEntrySchema.index({ owner: 1, createdAt: -1 });

export const WorkEntryModel = model('WorkEntry', workEntrySchema);
