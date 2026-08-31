/**
 * The structured location contract, shared by Browse today and by Register/Edit Profile when they
 * are corrected later. `placeId` is the stable identity; the rest is what a screen renders.
 */
export interface StructuredPlace {
  readonly placeId: string;
  readonly displayName: string;
  /** Locality where Google supplies one. Legacy rows may carry only the free-text city. */
  readonly city?: string;
  /** Administrative area, kept separate from the project's own `region` enum. */
  readonly adminArea?: string;
  readonly latitude: number;
  readonly longitude: number;
}

/** A place the contractor confirmed willingness to reach, and how it got onto the list. */
export interface ApprovedTravelLocation extends StructuredPlace {
  readonly source: TravelLocationSource;
  readonly approvedAt: Date;
  /** Road distance at the time it was proposed. Absent for a manual add outside the radius. */
  readonly drivingDistanceMeters?: number;
}

/**
 * `suggested` came from the radius proposal and survived review; `manual` was added by hand and may
 * sit outside the radius. The distinction is why a removed place never returns on its own.
 */
export const TRAVEL_LOCATION_SOURCES = ['suggested', 'manual'] as const;
export type TravelLocationSource = (typeof TRAVEL_LOCATION_SOURCES)[number];

/** One leg of a road-distance answer. `status` separates a real result from a failure. */
export interface RouteDistance {
  readonly destinationPlaceId: string;
  readonly distanceMeters: number | null;
  readonly status: RouteDistanceStatus;
}

/**
 * `ok` carries a distance. `no_route` means Google answered but found none. `failed` means the
 * call itself did not produce an answer — which is never the same as "outside the radius".
 */
export const ROUTE_DISTANCE_STATUSES = ['ok', 'no_route', 'failed'] as const;
export type RouteDistanceStatus = (typeof ROUTE_DISTANCE_STATUSES)[number];