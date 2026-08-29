import Joi from 'joi';

export interface ProposeTravelBody {
  readonly originPlaceId: string;
  readonly travelRadiusKm: number;
}

export const proposeTravelBodySchema = Joi.object<ProposeTravelBody>({
  originPlaceId: Joi.string().trim().min(1).max(300).required(),
  travelRadiusKm: Joi.number().integer().min(1).max(500).required(),
});

export interface SaveTravelLocationBody {
  readonly placeId: string;
  readonly displayName: string;
  readonly city?: string;
  readonly adminArea?: string;
  readonly latitude: number;
  readonly longitude: number;
  readonly source: 'suggested' | 'manual';
  readonly drivingDistanceMeters?: number;
}

const travelLocation = Joi.object<SaveTravelLocationBody>({
  placeId: Joi.string().trim().min(1).max(300).required(),
  displayName: Joi.string().trim().min(1).max(200).required(),
  city: Joi.string().trim().max(120).optional(),
  adminArea: Joi.string().trim().max(120).optional(),
  latitude: Joi.number().min(-90).max(90).required(),
  longitude: Joi.number().min(-180).max(180).required(),
  source: Joi.string().valid('suggested', 'manual').required(),
  drivingDistanceMeters: Joi.number().min(0).optional(),
});

export interface RemovedTravelLocationBody {
  readonly placeId: string;
  readonly displayName: string;
}

const removedTravelLocation = Joi.object<RemovedTravelLocationBody>({
  placeId: Joi.string().trim().min(1).max(300).required(),
  displayName: Joi.string().trim().min(1).max(200).required(),
});

export interface SaveTravelBody {
  readonly travelRadiusKm?: number;
  readonly basePlace?: SaveTravelLocationBody;
  readonly approvedTravelLocations: readonly SaveTravelLocationBody[];
  readonly removedTravelLocations?: readonly RemovedTravelLocationBody[];
}

/** The list is required even when empty: an empty array is a real answer, not a missing one. */
export const saveTravelBodySchema = Joi.object<SaveTravelBody>({
  travelRadiusKm: Joi.number().integer().min(1).max(500).optional(),
  basePlace: travelLocation.optional(),
  approvedTravelLocations: Joi.array().items(travelLocation).max(300).required(),
  removedTravelLocations: Joi.array().items(removedTravelLocation).max(300).optional(),
});
