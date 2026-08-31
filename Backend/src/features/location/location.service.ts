import { Types } from 'mongoose';

import type { UserRepository } from '../users/user.repository.js';
import type {
  StoredApprovedTravelLocation,
  StoredExcludedTravelLocation,
  StoredPlace,
} from '../users/user.model.js';
import type { SaveTravelBody } from './location.validation.js';

/** The editor's own view of its saved answers. Only ever returned to the person it belongs to. */
export interface MyTravelPreferencesDto {
  readonly travelRadiusKm: number | null;
  readonly basePlace: StoredPlace | null;
  readonly approvedTravelLocations: readonly StoredApprovedTravelLocation[];
  readonly previouslyRemoved: readonly StoredExcludedTravelLocation[];
}

export interface LocationService {
  saveTravelPreferences(actorId: string, input: SaveTravelBody): Promise<void>;
  /** What the radius proposal must not suggest again. */
  excludedPlaceIds(actorId: string): Promise<readonly string[]>;
  mine(actorId: string): Promise<MyTravelPreferencesDto>;
}

export interface LocationDependencies {
  readonly users: UserRepository;
}

const toStoredPlace = (place: SaveTravelBody['basePlace']): StoredPlace | undefined =>
  place === undefined
    ? undefined
    : {
        placeId: place.placeId,
        displayName: place.displayName,
        latitude: place.latitude,
        longitude: place.longitude,
        ...(place.city === undefined ? {} : { city: place.city }),
        ...(place.adminArea === undefined ? {} : { adminArea: place.adminArea }),
      };

export const createLocationService = ({ users }: LocationDependencies): LocationService => ({
  /**
   * The list arrives already edited by the person. Nothing is recomputed here, which is what makes
   * a removed place stay removed and a manually added one stay approved.
   */
  async saveTravelPreferences(actorId, input) {
    const approvedAt = new Date();
    const deduped = new Map<string, StoredApprovedTravelLocation>();

    for (const place of input.approvedTravelLocations) {
      deduped.set(place.placeId, {
        placeId: place.placeId,
        displayName: place.displayName,
        latitude: place.latitude,
        longitude: place.longitude,
        source: place.source,
        approvedAt,
        ...(place.city === undefined ? {} : { city: place.city }),
        ...(place.adminArea === undefined ? {} : { adminArea: place.adminArea }),
        ...(place.drivingDistanceMeters === undefined
          ? {}
          : { drivingDistanceMeters: place.drivingDistanceMeters }),
      });
    }

    const current = await users.findTravelPreferences(actorId);
    const exclusions = new Map<string, StoredExcludedTravelLocation>();

    for (const place of current?.excludedTravelLocations ?? []) {
      exclusions.set(place.placeId, place);
    }
    for (const place of input.removedTravelLocations ?? []) {
      if (exclusions.has(place.placeId)) continue;
      exclusions.set(place.placeId, {
        placeId: place.placeId,
        displayName: place.displayName,
        excludedAt: approvedAt,
      });
    }
    for (const placeId of deduped.keys()) exclusions.delete(placeId);

    const base = toStoredPlace(input.basePlace);

    await users.saveTravelPreferences(new Types.ObjectId(actorId), {
      approvedTravelLocations: [...deduped.values()],
      excludedTravelLocations: [...exclusions.values()],
      ...(input.travelRadiusKm === undefined ? {} : { travelRadiusKm: input.travelRadiusKm }),
      ...(base === undefined ? {} : { place: base }),
    });
  },

  async excludedPlaceIds(actorId) {
    const current = await users.findTravelPreferences(actorId);
    return (current?.excludedTravelLocations ?? []).map((place) => place.placeId);
  },

  async mine(actorId) {
    const current = await users.findTravelPreferences(actorId);

    return {
      travelRadiusKm: current?.travelRadiusKm ?? null,
      basePlace: current?.basePlace ?? null,
      approvedTravelLocations: current?.approvedTravelLocations ?? [],
      previouslyRemoved: current?.excludedTravelLocations ?? [],
    };
  },
});
