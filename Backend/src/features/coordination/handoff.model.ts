import { Schema, model, type Types } from 'mongoose';

export const HANDOFF_KINDS = ['authority', 'delegation_disclosure'] as const;
export type HandoffKind = (typeof HANDOFF_KINDS)[number];

export const HANDOFF_STATES = ['proposed', 'accepted', 'declined', 'cancelled'] as const;
export type HandoffState = (typeof HANDOFF_STATES)[number];

export interface HandoffRecord {
  readonly _id: Types.ObjectId;
  readonly project: Types.ObjectId;
  readonly task: Types.ObjectId;
  readonly from: Types.ObjectId;
  readonly to: Types.ObjectId;
  readonly kind: HandoffKind;
  readonly initiatedBy: Types.ObjectId;
  readonly initiatedAt: Date;
  readonly completedWorkAtHandover: string;
  readonly state: HandoffState;
  readonly decidedBy?: Types.ObjectId;
  readonly decidedAt?: Date;
  readonly proposal?: Types.ObjectId;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const handoffSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    from: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    to: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: HANDOFF_KINDS, required: true },
    initiatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    initiatedAt: { type: Date, required: true, default: () => new Date() },
    completedWorkAtHandover: { type: String, required: true, trim: true, maxlength: 600 },
    state: { type: String, enum: HANDOFF_STATES, required: true, default: 'proposed' },
    decidedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    decidedAt: { type: Date },
    proposal: { type: Schema.Types.ObjectId, ref: 'RescheduleProposal' },
  },
  { timestamps: true },
);

handoffSchema.index({ task: 1, state: 1 });
handoffSchema.index({ from: 1, state: 1, decidedAt: -1 });
handoffSchema.index({ to: 1, state: 1 });

export const WorkHandoffModel = model('WorkHandoff', handoffSchema);
