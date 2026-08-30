import { Schema, model, type Types } from 'mongoose';

import type { StructuredPlace } from '../location/place.types.js';
import { REGIONS, type Region } from '../users/user.model.js';
import { PROJECT_TYPES, type ProjectType } from './projectType.js';
import { SECTORS, WEEKDAYS, type WorkingCalendarOverrides } from '../calendar/workingCalendar.types.js';

/** One recorded move of the target end date, and the overrun it produced against the original. */
export interface TargetChangeRecord {
  readonly from: Date;
  readonly to: Date;
  readonly overrunDaysFromOriginal: number;
  readonly changedAt: Date;
  readonly changedBy: Types.ObjectId;
}

/** One explicit move from one pinned company-calendar version to another. Never automatic. */
export interface CalendarAdoptionRecord {
  readonly fromVersion: Types.ObjectId | null;
  readonly toVersion: Types.ObjectId;
  readonly adoptedAt: Date;
  readonly adoptedBy: Types.ObjectId;
  readonly overridesKept: boolean;
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
  readonly projectType: ProjectType;
  readonly projectTypeOther?: string;
  readonly size: string;
  readonly location?: ProjectLocation;
  readonly startDate: Date;
  readonly targetEndDate: Date;
  readonly originalTargetEndDate: Date;
  readonly overrunAllowanceDays: number;
  readonly targetChanges: readonly TargetChangeRecord[];
  readonly calendarVersion: Types.ObjectId;
  readonly calendarOverrides?: WorkingCalendarOverrides;
  readonly calendarAdoptions: readonly CalendarAdoptionRecord[];
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

const overridesSchema = new Schema(
  {
    workingDays: [{ type: String, enum: WEEKDAYS }],
    hours: {
      startMinute: { type: Number, min: 0, max: 1440 },
      endMinute: { type: Number, min: 0, max: 1440 },
    },
    sector: { type: String, enum: SECTORS },
    worksCholHaMoed: { type: Boolean },
    worksMemorialDays: { type: Boolean },
  },
  { _id: false },
);

const calendarAdoptionSchema = new Schema(
  {
    fromVersion: { type: Schema.Types.ObjectId, ref: 'CompanyCalendarVersion', default: null },
    toVersion: { type: Schema.Types.ObjectId, ref: 'CompanyCalendarVersion', required: true },
    adoptedAt: { type: Date, required: true },
    adoptedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    overridesKept: { type: Boolean, required: true },
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

    // Known upfront and required: the GC cannot set work rules without them.
    projectType: { type: String, enum: PROJECT_TYPES, required: true },
    // Free text kept apart from the canonical value, so `other` never pollutes the enum.
    projectTypeOther: { type: String, trim: true, maxlength: 120 },
    // Free text by decision: "בניין 10/12 קומות" and "2 בניינים" are how scale is really said.
    size: { type: String, required: true, trim: true, maxlength: 200 },

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

    // The PIN. A company-default edit appends a new version; this keeps pointing at the old one,
    // which is the entire reason a live project cannot change under anybody's feet.
    calendarVersion: {
      type: Schema.Types.ObjectId,
      ref: 'CompanyCalendarVersion',
      required: true,
    },
    calendarOverrides: { type: overridesSchema, required: false },
    calendarAdoptions: { type: [calendarAdoptionSchema], default: [] },

    startedAt: { type: Date },
    completedAt: { type: Date },
    pausedAt: { type: Date },
  },
  { timestamps: true },
);

projectSchema.index({ company: 1, createdAt: -1, _id: -1 });

export const ProjectModel = model('Project', projectSchema);
