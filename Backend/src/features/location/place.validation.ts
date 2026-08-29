import Joi from 'joi';

/**
 * The one structured-place body shape the API accepts, wherever a place is chosen: Register, the
 * profile edit, and the travel editor. A place is only ever a Google place with an id — free text
 * never becomes one, so a legacy `city` string is never turned into a Place ID.
 */
export interface StructuredPlaceBody {
  readonly placeId: string;
  readonly displayName: string;
  readonly city?: string;
  readonly adminArea?: string;
  readonly latitude: number;
  readonly longitude: number;
}

export const structuredPlaceSchema = Joi.object<StructuredPlaceBody>({
  placeId: Joi.string().trim().min(1).max(300).required(),
  displayName: Joi.string().trim().min(1).max(200).required(),
  city: Joi.string().trim().max(120).optional(),
  adminArea: Joi.string().trim().max(120).optional(),
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
});
