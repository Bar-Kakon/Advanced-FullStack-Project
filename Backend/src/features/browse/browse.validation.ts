import Joi from 'joi';

import { AVAILABILITY_STATUSES } from '../companies/company.model.js';
import { REGIONS, REGISTRATION_CATEGORIES, SPECIALTIES } from '../users/user.model.js';
import { BROWSE_SORTS, type BrowseSort } from './browse.repository.js';

export const BROWSE_DEFAULT_LIMIT = 12;
export const BROWSE_MAX_LIMIT = 48;

export interface BrowseSearchQuery {
  readonly q?: string;
  /** Which registration routes to search. Absent searches all three. */
  readonly category?: string[];
  readonly specialty?: string[];
  readonly region?: string[];
  readonly availability?: string[];
  readonly placeId?: string;
  readonly originPlaceId?: string;
  readonly maxDrivingKm?: number;
  readonly minRating?: number;
  readonly sort: BrowseSort;
  readonly cursor?: string;
  readonly limit: number;
}

/** `csv` so `?specialty=a,b` and repeated `?specialty=a&specialty=b` both work. */
const codeList = (values: readonly string[]) =>
  Joi.array().items(Joi.string().valid(...values)).single().unique().optional();

export const browseSearchQuerySchema = Joi.object<BrowseSearchQuery>({
  q: Joi.string().trim().min(1).max(120).optional(),
  category: codeList(REGISTRATION_CATEGORIES),
  specialty: codeList(SPECIALTIES),
  region: codeList(REGIONS),
  availability: codeList(AVAILABILITY_STATUSES),
  placeId: Joi.string().trim().min(1).max(300).optional(),
  originPlaceId: Joi.string().trim().min(1).max(300).optional(),
  maxDrivingKm: Joi.number().min(1).max(500).optional(),
  minRating: Joi.number().min(1).max(5).optional(),
  // No flexibility order: D6 has no arithmetic, so there is no score to sort on.
  sort: Joi.string().valid(...BROWSE_SORTS).default('relevance'),
  cursor: Joi.string().trim().max(200).optional(),
  limit: Joi.number().integer().min(1).max(BROWSE_MAX_LIMIT).default(BROWSE_DEFAULT_LIMIT),
})
  .and('originPlaceId', 'maxDrivingKm')
  .messages({ 'object.and': 'A driving-distance filter needs both an origin and a maximum' });

export interface ContractorParams {
  readonly userId: string;
}

export const contractorParamsSchema = Joi.object<ContractorParams>({
  userId: Joi.string().hex().length(24).required(),
});

export interface WorkImageParams extends ContractorParams {
  readonly entryId: string;
}

export const workImageParamsSchema = Joi.object<WorkImageParams>({
  userId: Joi.string().hex().length(24).required(),
  entryId: Joi.string().hex().length(24).required(),
});
