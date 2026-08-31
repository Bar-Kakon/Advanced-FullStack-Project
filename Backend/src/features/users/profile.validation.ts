import Joi from 'joi';

import { structuredPlaceSchema, type StructuredPlaceBody } from '../location/place.validation.js';
import { phone, prose } from '../../shared/fieldRules.js';

import {
  DRILLING_TYPES,
  HEAVY_EQUIPMENT,
  OTHER_SPECIALTIES,
  REGIONS,
  SPECIALTIES,
  type DrillingType,
  type HeavyEquipment,
  type Region,
  type Specialty,
} from './user.model.js';
import { AVAILABILITY_STATUSES, type Availability } from '../companies/company.model.js';

const MAX_NAME_LENGTH = 100;
const MAX_BIO_LENGTH = 600;
const MAX_CITY_LENGTH = 80;
const MAX_SPECIALTY_OTHER_LENGTH = 60;
const MAX_COMPANY_NAME_LENGTH = 120;

/**
 * The same rules Register applies, so one screen cannot accept what the other refuses. `null`
 * clears an optional value; omitting the key leaves it untouched.
 */
const clearablePhone = () => phone().allow(null);
const clearableProse = (max: number) => prose(max).allow(null);

export interface ProfileUpdateBody {
  readonly firstName?: string;
  readonly lastName?: string;
  readonly bio?: string;
  readonly specialties?: readonly Specialty[];
  readonly specialtyOther?: string | null;
  readonly heavyEquipment?: readonly HeavyEquipment[];
  readonly drillingTypes?: readonly DrillingType[];
  readonly businessPhone?: string | null;
  readonly city?: string;
  readonly region?: Region;
  readonly place?: StructuredPlaceBody;
  readonly travelRadiusKm?: number;
  readonly delayToleranceDays?: number;
  readonly noticeRequiredDays?: number;
}

/**
 * An explicit allowlist. `validateRequest` strips unknown keys, so a body carrying `status`,
 * `standing`, `permissions`, `passwordHash`, `companyName` or `availability` loses them here —
 * and `min(1)` on the object means an empty patch is refused rather than silently doing nothing.
 */
export const profileUpdateBodySchema = Joi.object<ProfileUpdateBody>({
  firstName: prose(MAX_NAME_LENGTH),
  lastName: prose(MAX_NAME_LENGTH),
  bio: Joi.string().trim().allow('').max(MAX_BIO_LENGTH),

  // The route the account was opened through is not editable here, and the service refuses any
  // specialty outside it — this list only proves the codes exist.
  specialties: Joi.array().items(Joi.string().valid(...SPECIALTIES)).min(1).unique(),
  // Required exactly when the route's `other` code is among the specialties, and refused otherwise,
  // so the enum and the free text can never describe two different things.
  specialtyOther: Joi.when('specialties', {
    // `required()` is what makes an absent `specialties` fail the condition rather than match it.
    is: Joi.array().items(Joi.string()).has(Joi.string().valid(...OTHER_SPECIALTIES)).required(),
    then: Joi.string().trim().min(1).max(MAX_SPECIALTY_OTHER_LENGTH).required(),
    otherwise: clearableProse(MAX_SPECIALTY_OTHER_LENGTH),
  }),

  heavyEquipment: Joi.array().items(Joi.string().valid(...HEAVY_EQUIPMENT)).unique(),
  drillingTypes: Joi.array().items(Joi.string().valid(...DRILLING_TYPES)).unique(),

  businessPhone: clearablePhone(),

  city: prose(MAX_CITY_LENGTH),
  region: Joi.string().valid(...REGIONS),
  place: structuredPlaceSchema,
  travelRadiusKm: Joi.number().integer().min(0).max(500),

  delayToleranceDays: Joi.number().integer().min(0).max(30),
  noticeRequiredDays: Joi.number().integer().min(0).max(14),
}).min(1);

export interface CompanyUpdateBody {
  readonly name?: string;
  readonly officePhone?: string | null;
  readonly availability?: Availability;
}

/** The three company-level values the profile screens show. Guarded by `company.manage`. */
export const companyUpdateBodySchema = Joi.object<CompanyUpdateBody>({
  name: prose(MAX_COMPANY_NAME_LENGTH),
  officePhone: clearablePhone(),
  availability: Joi.string().valid(...AVAILABILITY_STATUSES),
}).min(1);

export interface WorkEntryBody {
  readonly title: string;
  readonly scope?: string;
  readonly meta: string;
  readonly projectId?: string;
  readonly taskId?: string;
  readonly imageAssetId?: string;
}

const objectId = Joi.string().hex().length(24);

/**
 * Both links are optional: a free-standing portfolio entry is a first-class kind, not a
 * degraded one. There is deliberately no `onFieldSync` / `verified` key — the badge is derived by
 * the server, so a client that sent one would find it stripped rather than honoured.
 */
export const workEntryBodySchema = Joi.object<WorkEntryBody>({
  title: Joi.string().trim().min(1).max(120).required(),
  scope: Joi.string().trim().min(1).max(160),
  meta: Joi.string().trim().min(1).max(120).required(),
  projectId: objectId,
  taskId: objectId,
  imageAssetId: objectId,
});

export interface WorkEntryUpdateBody {
  readonly title?: string;
  readonly scope?: string;
  readonly meta?: string;
}

/** The three fields the owner typed; an empty `scope` clears the optional line. */
export const workEntryUpdateBodySchema = Joi.object<WorkEntryUpdateBody>({
  title: Joi.string().trim().min(1).max(120),
  scope: Joi.string().trim().max(160).allow(''),
  meta: Joi.string().trim().min(1).max(120),
});
