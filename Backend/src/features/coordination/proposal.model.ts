import { Schema, model, type Types } from 'mongoose';

export const DEFAULT_PROPOSAL_RESPONSE_HOURS = 72;

export const PROPOSAL_STATUSES = ['requested', 'open', 'expired', 'resolved', 'cancelled'] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number];

export const ITEM_RESPONSES = ['pending', 'accepted', 'declined', 'countered'] as const;
export type ItemResponse = (typeof ITEM_RESPONSES)[number];

export const ITEM_RESOLUTIONS = ['none', 'proposed', 'counter', 'replaced'] as const;
export type ItemResolution = (typeof ITEM_RESOLUTIONS)[number];

export const JUSTIFIED_DECLINE_REASONS = [
  'health',
  'plans_not_ready',
  'equipment_failure',
  'permit_unavailable',
  'gc_stop',
  'materials_not_arrived',
  'tools_not_arrived',
] as const;
export type JustifiedDeclineReason = (typeof JUSTIFIED_DECLINE_REASONS)[number];

export const HOLD_REASON_VALUES = ['initiating', 'gate', 'sequence'] as const;

export interface ProposalItemRecord {
  readonly _id: Types.ObjectId;
  readonly task: Types.ObjectId;
  readonly respondent: Types.ObjectId;
  readonly currentStart: Date;
  readonly currentDue: Date;
  readonly proposedStart: Date;
  readonly proposedDue: Date;
  readonly reason: (typeof HOLD_REASON_VALUES)[number];
  readonly response: ItemResponse;
  readonly declineReason?: JustifiedDeclineReason;
  readonly counterStart?: Date;
  readonly counterDue?: Date;
  readonly respondedAt?: Date;
  readonly resolution: ItemResolution;
  readonly excluded: boolean;
  readonly excludedBy?: Types.ObjectId;
}

export interface RequestedChanges {
  readonly deltaWorkingDays?: number;
  readonly alternativeStart?: Date;
  readonly alternativeDue?: Date;
  readonly note?: string;
}

export interface ProposalResolution {
  readonly by: Types.ObjectId;
  readonly at: Date;
  readonly note?: string;
}

export interface ProposalRecord {
  readonly _id: Types.ObjectId;
  readonly project: Types.ObjectId;
  readonly initiatingTask: Types.ObjectId;
  readonly requestedBy: Types.ObjectId;
  readonly reason?: string;
  readonly changes: RequestedChanges;
  readonly status: ProposalStatus;
  readonly responseHours: number;
  readonly expiresAt?: Date;
  readonly launchedBy?: Types.ObjectId;
  readonly launchedAt?: Date;
  readonly parentProposal?: Types.ObjectId;
  readonly items: readonly ProposalItemRecord[];
  readonly resolution?: ProposalResolution;
  readonly cancelledBy?: Types.ObjectId;
  readonly cancelledAt?: Date;
  readonly expiredAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const itemSchema = new Schema(
  {
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    respondent: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    currentStart: { type: Date, required: true },
    currentDue: { type: Date, required: true },
    proposedStart: { type: Date, required: true },
    proposedDue: { type: Date, required: true },
    reason: { type: String, enum: HOLD_REASON_VALUES, required: true },
    response: { type: String, enum: ITEM_RESPONSES, required: true, default: 'pending' },
    declineReason: { type: String, enum: JUSTIFIED_DECLINE_REASONS },
    counterStart: { type: Date },
    counterDue: { type: Date },
    respondedAt: { type: Date },
    resolution: { type: String, enum: ITEM_RESOLUTIONS, required: true, default: 'none' },
    excluded: { type: Boolean, required: true, default: false },
    excludedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { _id: true },
);

const changesSchema = new Schema(
  {
    deltaWorkingDays: { type: Number, min: -3650, max: 3650 },
    alternativeStart: { type: Date },
    alternativeDue: { type: Date },
    note: { type: String, trim: true, maxlength: 400 },
  },
  { _id: false },
);

const proposalSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    initiatingTask: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    requestedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reason: { type: String, trim: true, maxlength: 600 },
    changes: { type: changesSchema, required: true },
    status: { type: String, enum: PROPOSAL_STATUSES, required: true, default: 'requested' },
    responseHours: { type: Number, required: true, min: 1, max: 8760 },
    expiresAt: { type: Date },
    launchedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    launchedAt: { type: Date },
    parentProposal: { type: Schema.Types.ObjectId, ref: 'RescheduleProposal' },
    items: { type: [itemSchema], default: [] },
    resolution: {
      type: new Schema(
        {
          by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          at: { type: Date, required: true },
          note: { type: String, trim: true, maxlength: 600 },
        },
        { _id: false },
      ),
      required: false,
    },
    cancelledBy: { type: Schema.Types.ObjectId, ref: 'User' },
    cancelledAt: { type: Date },
    expiredAt: { type: Date },
  },
  { timestamps: true },
);

proposalSchema.index({ 'items.respondent': 1, status: 1 });
proposalSchema.index({ project: 1, status: 1, createdAt: -1 });
proposalSchema.index({ status: 1, expiresAt: 1 });

export const RescheduleProposalModel = model('RescheduleProposal', proposalSchema);
