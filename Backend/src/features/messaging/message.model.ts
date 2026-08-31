import { Schema, model, type Types } from 'mongoose';

/**
 * `agreement` is a structured exchange inside the conversation, never a screen of its own. It is a
 * message like any other, so it paginates, it keeps its place in the history, and it cannot drift
 * away from the thread it was agreed in.
 */
export const MESSAGE_KINDS = ['text', 'agreement'] as const;
export type MessageKind = (typeof MESSAGE_KINDS)[number];

export const AGREEMENT_STATES = ['proposed', 'accepted', 'declined', 'withdrawn'] as const;
export type AgreementState = (typeof AGREEMENT_STATES)[number];

/**
 * What an accepted agreement becomes. The fields are the Create Task fields, so acceptance calls
 * the existing task domain rather than a second one — there is no second task schema.
 */
export interface AgreementRecord {
  readonly title: string;
  readonly description?: string;
  readonly startDate: string;
  readonly dueDate: string;
  readonly project?: Types.ObjectId;
  readonly state: AgreementState;
  readonly respondedBy?: Types.ObjectId;
  readonly respondedAt?: Date;
  /** Written exactly once, on acceptance. Its presence is what refuses a second Task. */
  readonly task?: Types.ObjectId;
}

export interface MessageRecord {
  readonly _id: Types.ObjectId;
  readonly conversation: Types.ObjectId;
  readonly sender: Types.ObjectId;
  readonly kind: MessageKind;
  readonly body?: string;
  readonly agreement?: AgreementRecord;
  readonly attachments: readonly Types.ObjectId[];
  /** Moderation removal. The row stays; ordinary readers see the neutral placeholder. */
  readonly removedAt?: Date;
  readonly removedBy?: Types.ObjectId;
  /** The persisted send time. Every timestamp and date separator is derived from this, never
   *  from when a client happened to receive it. */
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const agreementSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    description: { type: String, trim: true, maxlength: 2000 },
    startDate: { type: String, required: true, trim: true, maxlength: 10 },
    dueDate: { type: String, required: true, trim: true, maxlength: 10 },
    project: { type: Schema.Types.ObjectId, ref: 'Project' },
    state: { type: String, enum: AGREEMENT_STATES, required: true, default: 'proposed' },
    respondedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    respondedAt: { type: Date },
    task: { type: Schema.Types.ObjectId, ref: 'Task' },
  },
  { _id: false },
);

const messageSchema = new Schema(
  {
    conversation: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true, index: true },
    sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    kind: { type: String, enum: MESSAGE_KINDS, required: true, default: 'text' },
    body: { type: String, trim: true, maxlength: 4000 },
    agreement: { type: agreementSchema },
    attachments: [{ type: Schema.Types.ObjectId, ref: 'FileAsset' }],
    removedAt: { type: Date },
    removedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

// The history read, newest first, and the exact shape the cursor walks.
messageSchema.index({ conversation: 1, createdAt: -1, _id: -1 });

export const MessageModel = model('Message', messageSchema);
