import { Schema, model, type Types } from 'mongoose';

/**
 * The receiver's own organisation of work they were given.
 *
 * Delegation hides WHO performs; this hides HOW the performer organises it. The two share a
 * serializer and nothing else. A private sub-task is a checklist item: it carries no dependency
 * edges, it cannot propagate a date, and the public state of the parent task is never derived
 * from it — the receiver sets that themselves with Start and Complete.
 */
export const PRIVATE_ITEM_KINDS = ['subtask', 'note'] as const;
export type PrivateItemKind = (typeof PRIVATE_ITEM_KINDS)[number];

export interface PrivateWorkItemRecord {
  readonly _id: Types.ObjectId;
  readonly task: Types.ObjectId;
  /** Whose private layer this is. Nobody else ever reads it, whatever their authority. */
  readonly owner: Types.ObjectId;
  readonly kind: PrivateItemKind;
  readonly body: string;
  /** Sub-tasks only. A checklist tick, with no bearing on the parent's public state. */
  readonly done: boolean;
  readonly order: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const privateWorkItemSchema = new Schema(
  {
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true, index: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    kind: { type: String, enum: PRIVATE_ITEM_KINDS, required: true },
    body: { type: String, required: true, trim: true, maxlength: 1000 },
    done: { type: Boolean, required: true, default: false },
    order: { type: Number, required: true, default: 0 },
  },
  { timestamps: true },
);

// Always read as "this person's private layer on this task" — never by task alone.
privateWorkItemSchema.index({ task: 1, owner: 1, order: 1 });

export const PrivateWorkItemModel = model('PrivateWorkItem', privateWorkItemSchema);
