import { Schema, model, type Types } from 'mongoose';

export const RATING_MIN = 1;
export const RATING_MAX = 5;

/** The two contexts that may prove a completed professional relationship inside one project. */
export const WORK_CONTEXT_KINDS = ['project_task', 'project_participation'] as const;
export type WorkContextKind = (typeof WORK_CONTEXT_KINDS)[number];

/** What the rating is earned on. `task` is present only for `project_task`. */
export interface RatingWorkContext {
  readonly kind: WorkContextKind;
  readonly project: Types.ObjectId;
  readonly task?: Types.ObjectId;
}

export interface RatingRecord {
  readonly _id: Types.ObjectId;
  readonly rater: Types.ObjectId;
  readonly ratee: Types.ObjectId;
  readonly score: number;
  readonly comment?: string;
  readonly context: RatingWorkContext;
  readonly createdAt: Date;
}

const workContextSchema = new Schema(
  {
    kind: { type: String, enum: WORK_CONTEXT_KINDS, required: true },
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true },
    task: { type: Schema.Types.ObjectId, ref: 'Task' },
  },
  { _id: false },
);

const ratingSchema = new Schema(
  {
    rater: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ratee: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    score: { type: Number, required: true, min: RATING_MIN, max: RATING_MAX },
    comment: { type: String, trim: true, maxlength: 600 },
    context: { type: workContextSchema, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// One peer rating per completed work context. A `project_task` context keys on the task; a
// `project_participation` context has no task, so it keys on the project.
ratingSchema.index(
  { rater: 1, ratee: 1, 'context.project': 1, 'context.task': 1 },
  { unique: true, name: 'rating_rater_ratee_context_unique' },
);

// A profile reads everything written about one person.
ratingSchema.index({ ratee: 1, createdAt: -1 });

export const RatingModel = model('Rating', ratingSchema);