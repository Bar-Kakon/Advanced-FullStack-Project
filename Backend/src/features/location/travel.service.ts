import type { PlacesAdapter } from './places.adapter.js';
import type { RoutesAdapter } from './routes.adapter.js';
import type { RouteDistance, StructuredPlace } from './place.types.js';

/** One candidate the radius proposal considered, with the road distance that decided it. */
export interface TravelCandidate extends StructuredPlace {
  readonly drivingDistanceMeters: number | null;
  readonly withinRadius: boolean;
  readonly routeStatus: RouteDistance['status'];
}

export interface TravelProposal {
  readonly origin: StructuredPlace;
  readonly travelRadiusKm: number;
  /** Inside the radius by road. What the review dialog pre-selects. */
  readonly suggested: readonly TravelCandidate[];
  /** Considered and rejected, or unroutable. Shown so the proposal is not silently lossy. */
  readonly excluded: readonly TravelCandidate[];
  /** Rediscovered, but taken out by the person before. Never suggested and never pre-selected. */
  readonly previouslyRemoved: readonly TravelCandidate[];
  /** True when at least one candidate could not be routed, so the list is known-incomplete. */
  readonly partial: boolean;
}

export interface TravelService {
  propose(
    originPlaceId: string,
    travelRadiusKm: number,
    previouslyRemovedPlaceIds: readonly string[],
  ): Promise<TravelProposal>;
}

export interface TravelDependencies {
  readonly places: PlacesAdapter;
  readonly routes: RoutesAdapter;
}

/**
 * Nearby Search takes an aerial circle, so the proposal is drawn wider than the driving radius and
 * then narrowed by real road distance. Road distance is always longer than the straight line, so a
 * 1:1 circle would miss reachable places.
 */
const DISCOVERY_RADIUS_FACTOR = 1.4;
const MAX_DISCOVERY_RADIUS_METERS = 50_000;

export const createTravelService = ({ places, routes }: TravelDependencies): TravelService => ({
  async propose(originPlaceId, travelRadiusKm, previouslyRemovedPlaceIds) {
    const origin = await places.resolve(originPlaceId);
    const removed = new Set(previouslyRemovedPlaceIds);

    const discoveryRadius = Math.min(
      travelRadiusKm * 1000 * DISCOVERY_RADIUS_FACTOR,
      MAX_DISCOVERY_RADIUS_METERS,
    );
    const candidates = await places.nearbyLocalities(origin.latitude, origin.longitude, discoveryRadius);
    const destinations = candidates.filter((place) => place.placeId !== origin.placeId);

    if (destinations.length === 0) {
      return {
        origin, travelRadiusKm, suggested: [], excluded: [], previouslyRemoved: [], partial: false,
      };
    }

    const distances = await routes.computeRouteMatrix(
      origin.placeId,
      destinations.map((place) => place.placeId),
    );
    const byPlaceId = new Map(distances.map((row) => [row.destinationPlaceId, row]));

    const limitMeters = travelRadiusKm * 1000;
    const suggested: TravelCandidate[] = [];
    const excluded: TravelCandidate[] = [];
    const previouslyRemoved: TravelCandidate[] = [];
    let partial = false;

    for (const place of destinations) {
      const route = byPlaceId.get(place.placeId);
      const status = route?.status ?? 'failed';
      const distanceMeters = route?.distanceMeters ?? null;

      // A failed route is not a distant place. It is excluded from the proposal and flagged.
      if (status !== 'ok' || distanceMeters === null) {
        if (status === 'failed') partial = true;
        const unroutable: TravelCandidate = {
          ...place, drivingDistanceMeters: null, withinRadius: false, routeStatus: status,
        };
        (removed.has(place.placeId) ? previouslyRemoved : excluded).push(unroutable);
        continue;
      }

      const candidate: TravelCandidate = {
        ...place,
        drivingDistanceMeters: distanceMeters,
        withinRadius: distanceMeters <= limitMeters,
        routeStatus: 'ok',
      };

      // An earlier removal outranks the radius, so rediscovery cannot undo the person's decision.
      if (removed.has(place.placeId)) previouslyRemoved.push(candidate);
      else (candidate.withinRadius ? suggested : excluded).push(candidate);
    }

    suggested.sort((a, b) => (a.drivingDistanceMeters ?? 0) - (b.drivingDistanceMeters ?? 0));

    return { origin, travelRadiusKm, suggested, excluded, previouslyRemoved, partial };
  },
});