import { Schema, model, type Types } from 'mongoose';

import type { StructuredPlace } from '../location/place.types.js';
import { REGIONS, type Region } from '../users/user.model.js';

/** One recorded move of the target end date, and the overrun it produced against the original. */
export interface TargetChangeRecord {
  readonly from: Date;
  readonly to: Date;
  readonly overrunDaysFromOriginal: number;
  readonly changedAt: Date;
  readonly changedBy: Types.ObjectId;
}

export interface ProjectLocation {
  readonly place?: StructuredPlace;
  readonly city?: string;
  readonly region?: Region;
  readonly address?: string;
}

export interface ProjectRecord {
  readonly _id: Types.ObjectId;
  readonly company: Types.ObjectId;
  readonly createdBy: Types.ObjectId;
  readonly name: string;
  readonly description?: string;
  readonly location?: ProjectLocation;
  readonly startDate: Date;
  readonly targetEndDate: Date;
  readonly originalTargetEndDate: Date;
  readonly overrunAllowanceDays: number;
  readonly targetChanges: readonly TargetChangeRecord[];
  readonly startedAt?: Date;
  readonly completedAt?: Date;
  readonly pausedAt?: Date;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

const placeSchema = new Schema(
  {
    placeId: { type: String, required: true, trim: true },
    displayName: { type: String, required: true, trim: true },
    city: { type: String, trim: true },
    adminArea: { type: String, trim: true },
    latitude: { type: Number, required: true, min: -90, max: 90 },
    longitude: { type: Number, required: true, min: -180, max: 180 },
  },
  { _id: false },
);

const targetChangeSchema = new Schema(
  {
    from: { type: Date, required: true },
    to: { type: Date, required: true },
    overrunDaysFromOriginal: { type: Number, required: true },
    changedAt: { type: Date, required: true },
    changedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { _id: false },
);

const projectSchema = new Schema(
  {
    // The owning context is the business, never the person. `createdBy` records who filled the
    // form and grants nothing on its own.
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true, index: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    name: { type: String, required: true, trim: true, maxlength: 160 },
    description: { type: String, trim: true, maxlength: 2000 },

    location: {
      place: { type: placeSchema, required: false },
      city: { type: String, trim: true },
      region: { type: String, enum: REGIONS },
      address: { type: String, trim: true, maxlength: 240 },
    },

    startDate: { type: Date, required: true },
    targetEndDate: { type: Date, required: true },

    // Kept for the life of the project and never rewritten, so the GC can always see what was
    // originally promised however many times the target has moved.
    originalTargetEndDate: { type: Date, required: true },

    // `x`, set once by the יזם. The ceiling is originalTargetEndDate + this, and it is immutable.
    overrunAllowanceDays: { type: Number, required: true, min: 0, max: 3650 },

    targetChanges: { type: [targetChangeSchema], default: [] },

    startedAt: { type: Date },
    completedAt: { type: Date },
    pausedAt: { type: Date },
  },
  { timestamps: true },
);

projectSchema.index({ company: 1, createdAt: -1, _id: -1 });

export const ProjectModel = model('Project', projectSchema);
