import { Schema, model, type Types } from 'mongoose';

export const RATING_MIN = 1;
export const RATING_MAX = 5;

export interface RatingRecord {
  readonly _id: Types.ObjectId;
  readonly rater: Types.ObjectId;
  readonly ratee: Types.ObjectId;
  readonly score: number;
  readonly comment?: string;
  /** The shared completed task the rating is earned on. */
  readonly task: Types.ObjectId;
  readonly createdAt: Date;
}

const ratingSchema = new Schema(
  {
    rater: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    ratee: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    score: { type: Number, required: true, min: RATING_MIN, max: RATING_MAX },
    comment: { type: String, trim: true, maxlength: 600 },
    task: { type: Schema.Types.ObjectId, ref: 'Task', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// One peer rating per shared completed task.
ratingSchema.index({ rater: 1, ratee: 1, task: 1 }, { unique: true, name: 'rating_rater_ratee_task_unique' });

// A profile reads everything written about one person.
ratingSchema.index({ ratee: 1, createdAt: -1 });

export const RatingModel = model('Rating', ratingSchema);