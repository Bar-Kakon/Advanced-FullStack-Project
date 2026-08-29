import { Schema, model, type Types } from 'mongoose';

/**
 * One person blocking another. A block is not a connection state: it may exist with an accepted
 * connection, with a pending one, or with no connection that ever existed.
 */
export interface BlockRecord {
  readonly _id: Types.ObjectId;
  readonly blockerUserId: Types.ObjectId;
  readonly blockedUserId: Types.ObjectId;
  readonly createdAt: Date;
}

const blockSchema = new Schema(
  {
    blockerUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    blockedUserId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// One row per direction, so blocking twice is refused and A→B and B→A stay separate facts.
blockSchema.index({ blockerUserId: 1, blockedUserId: 1 }, { unique: true, name: 'blocker_blocked_unique' });

// Browse asks both directions for one viewer, and My Network lists what that viewer blocked.
blockSchema.index({ blockedUserId: 1 });

export const BlockModel = model('Block', blockSchema);