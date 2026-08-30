import Joi from 'joi';

import { structuredPlaceSchema, type StructuredPlaceBody } from '../location/place.validation.js';
import { REGIONS, type Region } from '../users/user.model.js';
import { PROJECT_TYPES, type ProjectType } from './projectType.js';
import { SECTORS, WEEKDAYS } from '../calendar/workingCalendar.types.js';

const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 20;
const CALENDAR_DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ProjectLocationBody {
  readonly place?: StructuredPlaceBody;
  readonly city?: string;
  readonly region?: Region;
  readonly address?: string;
}

const locationSchema = Joi.object<ProjectLocationBody>({
  place: structuredPlaceSchema.optional(),
  city: Joi.string().trim().max(120).optional(),
  region: Joi.string().valid(...REGIONS).optional(),
  address: Joi.string().trim().max(240).optional(),
});

const calendarDate = Joi.string().pattern(CALENDAR_DATE);

export interface CreateProjectBody {
  readonly name: string;
  readonly projectType: ProjectType;
  readonly projectTypeOther?: string;
  readonly size: string;
  readonly description?: string;
  readonly location?: ProjectLocationBody;
  readonly startDate: string;
  readonly targetEndDate: string;
  readonly overrunAllowanceDays: number;
}

export const createProjectBodySchema = Joi.object<CreateProjectBody>({
  name: Joi.string().trim().min(1).max(160).required(),
  projectType: Joi.string().valid(...PROJECT_TYPES).required(),
  // Required exactly when the type is `other`, and refused otherwise, so free text can never sit
  // beside a canonical value and quietly disagree with it.
  projectTypeOther: Joi.when('projectType', {
    is: 'other',
    then: Joi.string().trim().min(1).max(120).required(),
    otherwise: Joi.any().forbidden(),
  }),
  size: Joi.string().trim().min(1).max(200).required(),
  description: Joi.string().trim().max(2000).allow('').optional(),
  location: locationSchema.optional(),
  startDate: calendarDate.required(),
  targetEndDate: calendarDate.required(),
  // `x`. Required at creation because every project has one, and never editable afterwards.
  overrunAllowanceDays: Joi.number().integer().min(0).max(3650).required(),
});

export interface UpdateProjectBody {
  readonly name?: string;
  readonly description?: string;
  readonly location?: ProjectLocationBody | null;
  readonly startDate?: string;
  readonly targetEndDate?: string;
  readonly projectType?: ProjectType;
  readonly projectTypeOther?: string;
  readonly size?: string;
  /** Present only so the schema can refuse it explicitly rather than dropping it silently. */
  readonly overrunAllowanceDays?: never;
}

/**
 * Every field is optional: a screen sends what it changed. `location: null` is the explicit clear,
 * which is different from omitting it — omitting leaves the stored location untouched.
 */
export const updateProjectBodySchema = Joi.object<UpdateProjectBody>({
  name: Joi.string().trim().min(1).max(160).optional(),
  projectType: Joi.string().valid(...PROJECT_TYPES).optional(),
  projectTypeOther: Joi.string().trim().max(120).allow('').optional(),
  size: Joi.string().trim().min(1).max(200).optional(),
  description: Joi.string().trim().max(2000).allow('').optional(),
  location: locationSchema.allow(null).optional(),
  startDate: calendarDate.optional(),
  targetEndDate: calendarDate.optional(),
  // Refused rather than ignored, so a client cannot believe it changed the ceiling.
  overrunAllowanceDays: Joi.any().forbidden(),
}).min(1);

export interface ProjectParams {
  readonly projectId: string;
}

export const projectParamsSchema = Joi.object<ProjectParams>({
  projectId: Joi.string().trim().required(),
});

export interface ProjectListQuery {
  readonly limit: number;
  readonly cursor?: string;
}

export const projectListQuerySchema = Joi.object<ProjectListQuery>({
  limit: Joi.number().integer().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT),
  cursor: Joi.string().max(200).optional(),
});


const hoursSchema = Joi.object({
  startMinute: Joi.number().integer().min(0).max(1440).required(),
  endMinute: Joi.number().integer().min(0).max(1440).required(),
});

/** A whole field is replaced or left alone; nothing merges inside `workingDays`. */
export const calendarOverridesSchema = Joi.object({
  workingDays: Joi.array().items(Joi.string().valid(...WEEKDAYS)).min(0).max(7).optional(),
  hours: hoursSchema.optional(),
  sector: Joi.string().valid(...SECTORS).optional(),
  worksCholHaMoed: Joi.boolean().optional(),
  worksMemorialDays: Joi.boolean().optional(),
});

export interface AdoptCalendarBody {
  readonly keepOverrides: boolean;
}

export const adoptCalendarBodySchema = Joi.object<AdoptCalendarBody>({
  // Explicit, because silently discarding a project's own customisation would be the same class of
  // surprise the pinning exists to prevent.
  keepOverrides: Joi.boolean().required(),
});

export const companyCalendarBodySchema = Joi.object({
  workingDays: Joi.array().items(Joi.string().valid(...WEEKDAYS)).min(0).max(7).required(),
  hours: hoursSchema.required(),
  sector: Joi.string().valid(...SECTORS).required(),
  worksCholHaMoed: Joi.boolean().required(),
  worksMemorialDays: Joi.boolean().required(),
});
