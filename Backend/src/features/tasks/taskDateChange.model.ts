import { Schema, model, type Types } from 'mongoose';

/**
 * One direct date change on standalone work: who moved the planned dates, from what, to what, and
 * why. Appended by the edit path and never rewritten, so the original agreement plus this trail is
 * the whole history. Project work never writes here — its dates move through the proposal flow,
 * which keeps its own audit.
 */
export interface TaskDateChangeRecord {
  readonly _id: Types.ObjectId;
  readonly task: Types.ObjectId;
  readonly actor: Types.ObjectId;
  readonly fromStartDate: Date;
  readonly fromDueDate: Date;
  readonly toStartDate: Date;
  readonly toDueDate: Date;
  readonly reason?: string;
  readonly at: Date;
}

const taskDateChangeSchema = new Schema(
  {
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fromStartDate: { type: Date, required: true },
    fromDueDate: { type: Date, required: true },
    toStartDate: { type: Date, required: true },
    toDueDate: { type: Date, required: true },
    reason: { type: String, trim: true, maxlength: 400 },
    at: { type: Date, required: true, default: () => new Date() },
  },
  { timestamps: false },
);

// Always read as one task's trail, newest first.
taskDateChangeSchema.index({ task: 1, at: -1 });

export const TaskDateChangeModel = model('TaskDateChange', taskDateChangeSchema);
