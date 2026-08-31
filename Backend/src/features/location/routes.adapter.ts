import { logger } from '../../shared/logger.js';
import { locationServiceNotConfigured } from './google.errors.js';
import type { RouteDistance } from './place.types.js';

/**
 * Road distance from one origin to many destinations. The application never sees a Google response
 * shape: it gets one `RouteDistance` per destination, including for the ones that failed.
 */
export interface RoutesAdapter {
  computeRouteMatrix(originPlaceId: string, destinationPlaceIds: readonly string[]): Promise<RouteDistance[]>;
}

export interface RoutesAdapterConfig {
  readonly apiKey: string | undefined;
  readonly timeoutMs: number;
}

const ROUTE_MATRIX_URL = 'https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix';

/** Google's own ceiling for one Compute Route Matrix call is 625 origin×destination pairs. */
export const ROUTE_MATRIX_MAX_ELEMENTS = 625;

const failedFor = (ids: readonly string[]): RouteDistance[] =>
  ids.map((destinationPlaceId) => ({ destinationPlaceId, distanceMeters: null, status: 'failed' as const }));

interface MatrixElement {
  readonly originIndex?: number;
  readonly destinationIndex?: number;
  readonly distanceMeters?: number;
  readonly condition?: string;
}

export const createGoogleRoutesAdapter = ({ apiKey, timeoutMs }: RoutesAdapterConfig): RoutesAdapter => ({
  async computeRouteMatrix(originPlaceId, destinationPlaceIds) {
    if (destinationPlaceIds.length === 0) return [];
    if (!apiKey) throw locationServiceNotConfigured();

    const batches: string[][] = [];
    for (let i = 0; i < destinationPlaceIds.length; i += ROUTE_MATRIX_MAX_ELEMENTS) {
      batches.push([...destinationPlaceIds].slice(i, i + ROUTE_MATRIX_MAX_ELEMENTS));
    }

    const results: RouteDistance[] = [];

    for (const batch of batches) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);

      try {
        const response = await fetch(ROUTE_MATRIX_URL, {
          method: 'POST',
          signal: controller.signal,
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': 'originIndex,destinationIndex,distanceMeters,condition',
          },
          body: JSON.stringify({
            origins: [{ waypoint: { placeId: originPlaceId } }],
            destinations: batch.map((placeId) => ({ waypoint: { placeId } })),
            travelMode: 'DRIVE',
          }),
        });

        if (!response.ok) {
          logger.warn('Route matrix call failed', { status: response.status, destinations: batch.length });
          results.push(...failedFor(batch));
          continue;
        }

        const elements = (await response.json()) as MatrixElement[];
        const byIndex = new Map<number, MatrixElement>();
        for (const element of elements) {
          if (typeof element.destinationIndex === 'number') byIndex.set(element.destinationIndex, element);
        }

        batch.forEach((destinationPlaceId, index) => {
          const element = byIndex.get(index);
          // A destination missing from a partial response is a failure, not a distant place.
          if (element === undefined) {
            results.push({ destinationPlaceId, distanceMeters: null, status: 'failed' });
            return;
          }
          if (element.condition !== 'ROUTE_EXISTS' || typeof element.distanceMeters !== 'number') {
            results.push({ destinationPlaceId, distanceMeters: null, status: 'no_route' });
            return;
          }
          results.push({ destinationPlaceId, distanceMeters: element.distanceMeters, status: 'ok' });
        });
      } catch (error) {
        logger.warn('Route matrix call threw', { message: (error as Error).message });
        results.push(...failedFor(batch));
      } finally {
        clearTimeout(timer);
      }
    }

    return results;
  },
});