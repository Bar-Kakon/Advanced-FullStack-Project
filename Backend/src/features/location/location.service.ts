import { Types } from 'mongoose';

import type { UserRepository } from '../users/user.repository.js';
import type { StoredApprovedTravelLocation, StoredPlace } from '../users/user.model.js';
import type { SaveTravelBody } from './location.validation.js';

export interface LocationService {
  saveTravelPreferences(actorId: string, input: SaveTravelBody): Promise<void>;
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

    const base = toStoredPlace(input.basePlace);

    await users.saveTravelPreferences(new Types.ObjectId(actorId), {
      approvedTravelLocations: [...deduped.values()],
      ...(input.travelRadiusKm === undefined ? {} : { travelRadiusKm: input.travelRadiusKm }),
      ...(base === undefined ? {} : { place: base }),
    });
  },
});
