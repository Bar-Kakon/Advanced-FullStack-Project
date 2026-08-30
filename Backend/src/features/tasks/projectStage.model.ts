import { Schema, model, type Types } from 'mongoose';

/**
 * One stage of one project's work, and the edges between stages.
 *
 * Owner decision (2026-08-30): dependencies run between STAGES, never between individual tasks —
 * אין דבר כזה בבניין עבודה ספציפית. A stage may be flagged a true gate, and the GC sets the stages
 * for each project, because the order varies project to project.
 */
export interface ProjectStageRecord {
  readonly _id: Types.ObjectId;
  readonly project: Types.ObjectId;
  readonly name: string;
  /** Display order the GC chose. It is not the dependency — `dependsOn` is. */
  readonly order: number;
  /** A true gate blocks everything downstream until it is complete, not merely finished-ish. */
  readonly isGate: boolean;
  /** The stages that must finish first. Directed edges, kept free of cycles. */
  readonly dependsOn: readonly Types.ObjectId[];
  /** שחרור חלקי — an authorised release of downstream work before this stage completes. */
  readonly partialReleaseAt?: Date;
  readonly partialReleaseBy?: Types.ObjectId;
  readonly partialReleaseNote?: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const projectStageSchema = new Schema(
  {
    project: { type: Schema.Types.ObjectId, ref: 'Project', required: true, index: true },
    name: { type: String, required: true, trim: true, maxlength: 120 },
    order: { type: Number, required: true, min: 0 },
    isGate: { type: Boolean, required: true, default: false },
    dependsOn: [{ type: Schema.Types.ObjectId, ref: 'ProjectStage' }],

    partialReleaseAt: { type: Date },
    partialReleaseBy: { type: Schema.Types.ObjectId, ref: 'User' },
    partialReleaseNote: { type: String, trim: true, maxlength: 400 },
  },
  { timestamps: true },
);

projectStageSchema.index({ project: 1, order: 1 });

export const ProjectStageModel = model('ProjectStage', projectStageSchema);
