import { Schema, model, type Types } from 'mongoose';

import { SECTORS, WEEKDAYS, type WorkingCalendarConfig } from './workingCalendar.types.js';

/**
 * One frozen version of a company's default working calendar.
 *
 * Versions are never edited. Changing the default appends a new one, which is the whole reason a
 * live project cannot be altered by somebody editing the company default: the project points at a
 * version, and that version keeps saying what it always said.
 */
export interface CompanyCalendarVersionRecord {
  readonly _id: Types.ObjectId;
  readonly company: Types.ObjectId;
  readonly version: number;
  readonly config: WorkingCalendarConfig;
  readonly createdBy: Types.ObjectId;
  readonly createdAt: Date;
}

const configSchema = new Schema(
  {
    workingDays: [{ type: String, enum: WEEKDAYS, required: true }],
    hours: {
      startMinute: { type: Number, required: true, min: 0, max: 1440 },
      endMinute: { type: Number, required: true, min: 0, max: 1440 },
    },
    sector: { type: String, enum: SECTORS, required: true },
    worksCholHaMoed: { type: Boolean, required: true },
    worksMemorialDays: { type: Boolean, required: true },
  },
  { _id: false },
);

const companyCalendarVersionSchema = new Schema(
  {
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    version: { type: Number, required: true, min: 1 },
    config: { type: configSchema, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// One row per company per version number, so two concurrent edits cannot both claim v4.
companyCalendarVersionSchema.index({ company: 1, version: -1 }, { unique: true });

export const CompanyCalendarVersionModel = model('CompanyCalendarVersion', companyCalendarVersionSchema);
