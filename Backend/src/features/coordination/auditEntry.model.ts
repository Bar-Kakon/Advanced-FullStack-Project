import { Schema, model, type Types } from 'mongoose';

export const AUDIT_ACTIONS = [
  'proposal.requested',
  'proposal.launched',
  'proposal.item_excluded',
  'proposal.item_included',
  'proposal.response_recorded',
  'proposal.counter_submitted',
  'proposal.counter_accepted',
  'proposal.counter_rejected',
  'proposal.cancelled',
  'proposal.expired',
  'proposal.resolved',
  'schedule.applied',
  'schedule.partial_release',
  'work.replacement_recorded',
  'stage.early_completion',
] as const;
export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export interface AuditEntryRecord {
  readonly _id: Types.ObjectId;
  readonly project: Types.ObjectId;
  readonly task?: Types.ObjectId;
  readonly proposal?: Types.ObjectId;
  readonly actor: Types.ObjectId;
  readonly actorName: string;
  readonly action: AuditAction;
  readonly parties: readonly Types.ObjectId[];
  readonly details: Record<string, unknown>;
  readonly partyDetails: Record<string, unknown>;
  readonly at: Date;
}

const auditEntrySchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    task: { type: Schema.Types.ObjectId, ref: 'Task' },
    proposal: { type: Schema.Types.ObjectId, ref: 'RescheduleProposal' },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    actorName: { type: String, required: true, trim: true, maxlength: 200 },
    action: { type: String, enum: AUDIT_ACTIONS, required: true },
    parties: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    details: { type: Schema.Types.Mixed, required: true, default: {} },
    partyDetails: { type: Schema.Types.Mixed, required: true, default: {} },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: false },
);

auditEntrySchema.index({ project: 1, at: -1 });
auditEntrySchema.index({ project: 1, parties: 1, at: -1 });
auditEntrySchema.index({ actor: 1, at: -1 });

export const AuditEntryModel = model('AuditEntry', auditEntrySchema);
