import { Schema, model, type Types } from 'mongoose';

/**
 * An explicit, revocable, task-scoped grant to view one agreement's documents. It is issued only
 * by a party who already holds document access by relationship, and it grants READING alone —
 * never the conversation, the task, or any scheduling or project authority.
 */
export interface AgreementDocumentGrantRecord {
  readonly _id: Types.ObjectId;
  readonly task: Types.ObjectId;
  readonly grantedTo: Types.ObjectId;
  readonly grantedBy: Types.ObjectId;
  readonly revokedAt?: Date;
  readonly revokedBy?: Types.ObjectId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const grantSchema = new Schema(
  {
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    grantedTo: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    grantedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    revokedAt: { type: Date },
    revokedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

// One grant row per viewer per task; re-granting revives the same row, keeping one history line.
grantSchema.index({ task: 1, grantedTo: 1 }, { unique: true });

export const AgreementDocumentGrantModel = model('AgreementDocumentGrant', grantSchema);
