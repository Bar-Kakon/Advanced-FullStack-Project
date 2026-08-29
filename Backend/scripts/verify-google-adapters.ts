/**
 * The Google boundary, with NO live calls. Every adapter is stubbed, so this proves how the
 * application behaves when Google succeeds, fails, times out or answers partially — deterministically
 * and without spending quota. `verify:google-live` is the separate smoke test that calls Google.
 */
import { createTravelService } from '../src/features/location/travel.service.js';
import { createBrowseService } from '../src/features/browse/browse.service.js';
import type { PlacesAdapter } from '../src/features/location/places.adapter.js';
import type { RoutesAdapter } from '../src/features/location/routes.adapter.js';
import type { StructuredPlace } from '../src/features/location/place.types.js';
import type { BrowseCandidate, BrowseRepository } from '../src/features/browse/browse.repository.js';
import { Types } from 'mongoose';

let failures = 0;
const check = (label: string, passed: boolean, detail = ''): void => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${label.padEnd(66)} ${detail}`);
};

const place = (id: string, name: string): StructuredPlace => ({
  placeId: id, displayName: name, latitude: 32.08, longitude: 34.78,
});

const origin = place('origin', 'Origin City');

const stubPlaces = (nearby: StructuredPlace[], onResolve?: () => never): PlacesAdapter => ({
  async resolve() {
    if (onResolve) onResolve();
    return origin;
  },
  async nearbyLocalities() {
    return nearby;
  },
});

const candidate = (id: string, placeId: string | null): BrowseCandidate => ({
  _id: new Types.ObjectId(id),
  firstName: 'A', lastName: 'B',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  companyName: null, companyId: null, officePhone: null, availability: null,
  ...(placeId === null ? {} : { location: { place: { placeId, displayName: placeId } } }),
});

const stubBrowseRepo = (rows: BrowseCandidate[]): BrowseRepository => ({
  async find() {
    return rows;
  },
});

const noBlocks = { hiddenUserIdsFor: async () => [] } as never;
const noRelationships = {
  forCandidates: async () => new Map(),
  between: async () => 'none' as const,
} as never;
const noRatings = { summaryForMany: async () => new Map(), summaryFor: async () => null } as never;

const run = async (): Promise<void> => {
  console.log('\n1. Travel proposal — the radius decides by ROAD distance');
  const nearby = [place('near', 'Near Town'), place('far', 'Far Town')];
  const routes: RoutesAdapter = {
    async computeRouteMatrix() {
      return [
        { destinationPlaceId: 'near', distanceMeters: 20_000, status: 'ok' },
        { destinationPlaceId: 'far', distanceMeters: 90_000, status: 'ok' },
      ];
    },
  };
  const proposal = await createTravelService({ places: stubPlaces(nearby), routes }).propose('origin', 50, []);
  check('a place inside the driving radius is suggested',
    proposal.suggested.map((p) => p.placeId).includes('near'));
  check('a place beyond it is excluded, with its distance recorded',
    proposal.excluded.some((p) => p.placeId === 'far' && p.drivingDistanceMeters === 90_000));
  check('the proposal is not marked partial when every route resolved', proposal.partial === false);

  console.log('\n2. A failed route is NOT "outside the radius"');
  const failing: RoutesAdapter = {
    async computeRouteMatrix() {
      return [
        { destinationPlaceId: 'near', distanceMeters: null, status: 'failed' },
        { destinationPlaceId: 'far', distanceMeters: 10_000, status: 'ok' },
      ];
    },
  };
  const partial = await createTravelService({ places: stubPlaces(nearby), routes: failing }).propose('origin', 50, []);
  check('the failed candidate is not suggested', !partial.suggested.some((p) => p.placeId === 'near'));
  check('it is reported with routeStatus failed, not a distance',
    partial.excluded.some((p) => p.placeId === 'near' && p.routeStatus === 'failed'));
  check('and the whole proposal is flagged partial', partial.partial === true);
  check('the destination that DID resolve is still suggested',
    partial.suggested.some((p) => p.placeId === 'far'));

  console.log('\n3. No route found is distinct from a failure');
  const noRoute: RoutesAdapter = {
    async computeRouteMatrix() {
      return [
        { destinationPlaceId: 'near', distanceMeters: null, status: 'no_route' },
        { destinationPlaceId: 'far', distanceMeters: null, status: 'no_route' },
      ];
    },
  };
  const unreachable = await createTravelService({ places: stubPlaces(nearby), routes: noRoute }).propose('origin', 50, []);
  check('nothing is suggested when no route exists', unreachable.suggested.length === 0);
  check('and it is NOT flagged partial — Google answered', unreachable.partial === false);

  console.log('\n4. Places returns nothing useful');
  const empty = await createTravelService({ places: stubPlaces([]), routes }).propose('origin', 50, []);
  check('an empty candidate list is an empty proposal, not a crash',
    empty.suggested.length === 0 && empty.excluded.length === 0);
  check('and it is not flagged partial', empty.partial === false);

  console.log('\n5. An invalid Place ID surfaces as an error, not a silent empty result');
  let threw = false;
  try {
    await createTravelService({
      places: stubPlaces([], () => { throw new Error('INVALID_PLACE_ID'); }),
      routes,
    }).propose('bad-place', 50, []);
  } catch {
    threw = true;
  }
  check('resolving an invalid origin throws rather than answering emptily', threw);

  console.log('\n6. Browse driving-distance filter');
  const rows = [candidate('aaaaaaaaaaaaaaaaaaaaaaa1', 'near'), candidate('aaaaaaaaaaaaaaaaaaaaaaa2', 'far')];
  let matrixCalls = 0;
  const countingRoutes: RoutesAdapter = {
    async computeRouteMatrix(_o, destinations) {
      matrixCalls += 1;
      return destinations.map((destinationPlaceId) => ({
        destinationPlaceId,
        distanceMeters: destinationPlaceId === 'near' ? 10_000 : 200_000,
        status: 'ok' as const,
      }));
    },
  };
  const browse = createBrowseService({
    browse: stubBrowseRepo(rows), blocks: noBlocks, relationships: noRelationships,
    ratings: noRatings, routes: countingRoutes,
  });
  const page = await browse.search('viewer', { limit: 10, originPlaceId: 'origin', maxDrivingKm: 50 });
  check('only the contractor within the driving radius is returned',
    page.contractors.length === 1 && page.contractors[0]?.userId === 'aaaaaaaaaaaaaaaaaaaaaaa1',
    `${page.contractors.length} rows`);
  check('the road distance is reported on the card',
    page.contractors[0]?.drivingDistanceMeters === 10_000);
  check('ONE Route Matrix call served the whole page — no call per card', matrixCalls === 1,
    `${matrixCalls} calls`);
  check('the page is not marked degraded when every route resolved',
    page.distanceFilterDegraded === false);

  console.log('\n7. A contractor with no structured place cannot be measured');
  matrixCalls = 0;
  const mixed = [candidate('aaaaaaaaaaaaaaaaaaaaaaa1', 'near'), candidate('aaaaaaaaaaaaaaaaaaaaaaa3', null)];
  const mixedPage = await createBrowseService({
    browse: stubBrowseRepo(mixed), blocks: noBlocks, relationships: noRelationships,
    ratings: noRatings, routes: countingRoutes,
  }).search('viewer', { limit: 10, originPlaceId: 'origin', maxDrivingKm: 50 });
  check('the unmeasurable contractor is dropped from a distance filter',
    !mixedPage.contractors.some((c) => c.userId === 'aaaaaaaaaaaaaaaaaaaaaaa3'));
  check('and the page says so through degraded, rather than pretending',
    mixedPage.distanceFilterDegraded === true);

  console.log('\n8. Google failing does not become a business answer');
  const brokenRoutes: RoutesAdapter = {
    async computeRouteMatrix(_o, destinations) {
      return destinations.map((destinationPlaceId) => ({
        destinationPlaceId, distanceMeters: null, status: 'failed' as const,
      }));
    },
  };
  const degradedPage = await createBrowseService({
    browse: stubBrowseRepo(rows), blocks: noBlocks, relationships: noRelationships,
    ratings: noRatings, routes: brokenRoutes,
  }).search('viewer', { limit: 10, originPlaceId: 'origin', maxDrivingKm: 50 });
  check('no contractor is silently declared out of range', degradedPage.contractors.length === 0);
  check('the response is flagged degraded so a client can say so',
    degradedPage.distanceFilterDegraded === true);

  console.log('\n9. Without a distance filter Google is never called at all');
  matrixCalls = 0;
  const plain = await createBrowseService({
    browse: stubBrowseRepo(rows), blocks: noBlocks, relationships: noRelationships,
    ratings: noRatings, routes: countingRoutes,
  }).search('viewer', { limit: 10 });
  check('an ordinary Browse query makes zero Route Matrix calls', matrixCalls === 0, `${matrixCalls}`);
  check('and returns every contractor', plain.contractors.length === 2);

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(2);
});