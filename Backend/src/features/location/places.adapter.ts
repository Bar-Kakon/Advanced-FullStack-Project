import { logger } from '../../shared/logger.js';
import { invalidPlaceId, locationServiceNotConfigured, locationServiceUnavailable } from './google.errors.js';
import type { StructuredPlace } from './place.types.js';

/**
 * Structured place lookup. `nearbyLocalities` proposes candidates around a base location; it is a
 * proposal, never a guarantee that every reachable locality was returned.
 */
export interface PlacesAdapter {
  resolve(placeId: string): Promise<StructuredPlace>;
  nearbyLocalities(latitude: number, longitude: number, radiusMeters: number): Promise<StructuredPlace[]>;
}

export interface PlacesAdapterConfig {
  readonly apiKey: string | undefined;
  readonly timeoutMs: number;
}

const PLACE_DETAILS_URL = 'https://places.googleapis.com/v1/places';
const NEARBY_SEARCH_URL = 'https://places.googleapis.com/v1/places:searchNearby';

/** Google caps one Nearby Search at 20 results, which is the ceiling on a single proposal call. */
export const NEARBY_MAX_RESULTS = 20;

interface GooglePlace {
  readonly id?: string;
  readonly displayName?: { readonly text?: string };
  readonly location?: { readonly latitude?: number; readonly longitude?: number };
  readonly addressComponents?: { readonly longText?: string; readonly types?: string[] }[];
}

const componentOfType = (place: GooglePlace, type: string): string | undefined =>
  place.addressComponents?.find((c) => c.types?.includes(type))?.longText;

const toStructuredPlace = (place: GooglePlace): StructuredPlace | null => {
  const latitude = place.location?.latitude;
  const longitude = place.location?.longitude;
  if (!place.id || typeof latitude !== 'number' || typeof longitude !== 'number') return null;

  const city = componentOfType(place, 'locality');
  const adminArea = componentOfType(place, 'administrative_area_level_1');

  return {
    placeId: place.id,
    displayName: place.displayName?.text ?? place.id,
    latitude,
    longitude,
    ...(city === undefined ? {} : { city }),
    ...(adminArea === undefined ? {} : { adminArea }),
  };
};

const withTimeout = async (timeoutMs: number, run: (signal: AbortSignal) => Promise<Response>) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await run(controller.signal);
  } finally {
    clearTimeout(timer);
  }
};

export const createGooglePlacesAdapter = ({ apiKey, timeoutMs }: PlacesAdapterConfig): PlacesAdapter => ({
  async resolve(placeId) {
    if (!apiKey) throw locationServiceNotConfigured();

    let response: Response;
    try {
      response = await withTimeout(timeoutMs, (signal) =>
        fetch(`${PLACE_DETAILS_URL}/${encodeURIComponent(placeId)}`, {
          signal,
          headers: {
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'id,displayName,location,addressComponents',
          },
        }),
      );
    } catch (error) {
      logger.warn('Place details call threw', { message: (error as Error).message });
      throw locationServiceUnavailable();
    }

    if (response.status === 404 || response.status === 400) throw invalidPlaceId();
    if (!response.ok) {
      logger.warn('Place details call failed', { status: response.status });
      throw locationServiceUnavailable();
    }

    const place = toStructuredPlace((await response.json()) as GooglePlace);
    if (place === null) throw invalidPlaceId();

    return place;
  },

  async nearbyLocalities(latitude, longitude, radiusMeters) {
    if (!apiKey) throw locationServiceNotConfigured();

    let response: Response;
    try {
      response = await withTimeout(timeoutMs, (signal) =>
        fetch(NEARBY_SEARCH_URL, {
          method: 'POST',
          signal,
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask':
              'places.id,places.displayName,places.location,places.addressComponents',
          },
          body: JSON.stringify({
            includedTypes: ['locality'],
            maxResultCount: NEARBY_MAX_RESULTS,
            locationRestriction: {
              circle: { center: { latitude, longitude }, radius: radiusMeters },
            },
          }),
        }),
      );
    } catch (error) {
      logger.warn('Nearby search call threw', { message: (error as Error).message });
      throw locationServiceUnavailable();
    }

    if (!response.ok) {
      logger.warn('Nearby search call failed', { status: response.status });
      throw locationServiceUnavailable();
    }

    const body = (await response.json()) as { places?: GooglePlace[] };
    return (body.places ?? [])
      .map(toStructuredPlace)
      .filter((place): place is StructuredPlace => place !== null);
  },
});