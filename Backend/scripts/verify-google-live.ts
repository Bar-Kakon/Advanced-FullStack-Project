/**
 * LIVE Google smoke test. It spends real quota, so it is separate from the regression suite.
 *
 * Needs GOOGLE_MAPS_API_KEY in the environment, with Places API (New) and Routes API enabled.
 * The key is never printed, and no response is logged verbatim.
 */
import { config as loadEnvFile } from 'dotenv';

import { loadConfig } from '../src/config/env.js';
import { createGooglePlacesAdapter } from '../src/features/location/places.adapter.js';
import { createGoogleRoutesAdapter } from '../src/features/location/routes.adapter.js';
import { createTravelService } from '../src/features/location/travel.service.js';

let failures = 0;
const check = (label: string, passed: boolean, detail = ''): void => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${label.padEnd(64)} ${detail}`);
};

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';

const EARTH_RADIUS_METERS = 6_371_000;

/** The straight line between two points, used only to prove a routed distance is not one. */
const aerialMeters = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number => {
  const toRad = (degrees: number): number => (degrees * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(a.latitude)) * Math.cos(toRad(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
};

const run = async (): Promise<void> => {
  loadEnvFile({ quiet: true });
  const { googleMaps } = loadConfig();

  if (!googleMaps.apiKey) {
    console.log('\n  BLOCKED — GOOGLE_MAPS_API_KEY is not set. No live call attempted.\n');
    process.exit(3);
  }
  console.log(`\n  key present (${googleMaps.apiKey.length} chars, value never printed)\n`);

  const places = createGooglePlacesAdapter(googleMaps);
  const routes = createGoogleRoutesAdapter(googleMaps);

  console.log('1. Places Autocomplete returns structured suggestions');
  const suggest = await fetch(AUTOCOMPLETE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': googleMaps.apiKey },
    body: JSON.stringify({ input: 'Haifa', includedRegionCodes: ['il'] }),
  });
  check('autocomplete answers 200', suggest.ok, String(suggest.status));
  const body = (await suggest.json()) as {
    suggestions?: { placePrediction?: { placeId?: string; text?: { text?: string } } }[];
  };
  const predictions = (body.suggestions ?? []).map((s) => s.placePrediction).filter(Boolean);
  check('it returns at least one prediction', predictions.length > 0, `${predictions.length}`);
  const haifaId = predictions[0]?.placeId;
  check('a prediction carries a stable Place ID', typeof haifaId === 'string' && haifaId.length > 5,
    haifaId ? `${haifaId.slice(0, 8)}…` : 'none');
  if (!haifaId) { console.log('\n  cannot continue without a Place ID\n'); process.exit(1); }

  console.log('\n2. Place Details resolves it to coordinates');
  const origin = await places.resolve(haifaId);
  check('resolve returns a display name', origin.displayName.length > 0, origin.displayName);
  check('and real coordinates inside Israel',
    origin.latitude > 29 && origin.latitude < 34 && origin.longitude > 34 && origin.longitude < 36,
    `${origin.latitude.toFixed(3)}, ${origin.longitude.toFixed(3)}`);

  console.log('\n3. An invalid Place ID is refused, not guessed at');
  let invalidHandled = false;
  try {
    await places.resolve('ChIJ-this-is-not-a-real-place-id');
  } catch (error) {
    invalidHandled = (error as { code?: string }).code === 'INVALID_PLACE_ID';
  }
  check('an unknown Place ID surfaces as INVALID_PLACE_ID', invalidHandled);

  console.log('\n4. Nearby Search proposes localities around it');
  const nearby = await places.nearbyLocalities(origin.latitude, origin.longitude, 30_000);
  check('it returns candidate localities', nearby.length > 0, `${nearby.length} candidates`);
  check('each carries a Place ID and coordinates',
    nearby.every((p) => p.placeId.length > 0 && Number.isFinite(p.latitude)));

  console.log('\n5. Route Matrix returns REAL road distance');
  const destinations = nearby.filter((p) => p.placeId !== origin.placeId).slice(0, 5);
  const matrix = await routes.computeRouteMatrix(origin.placeId, destinations.map((p) => p.placeId));
  check('one call answered for every destination', matrix.length === destinations.length,
    `${matrix.length}/${destinations.length}`);
  const ok = matrix.filter((r) => r.status === 'ok' && r.distanceMeters !== null);
  check('at least one real road distance came back', ok.length > 0, `${ok.length} routed`);
  const nearest = ok.sort((a, b) => (a.distanceMeters ?? 0) - (b.distanceMeters ?? 0))[0];
  check('a nearby destination has a plausible road distance',
    nearest !== undefined && nearest.distanceMeters! > 0 && nearest.distanceMeters! < 120_000,
    nearest ? `${Math.round(nearest.distanceMeters! / 1000)} km` : 'none');
  check('road distance is never a straight line of zero',
    ok.every((r) => (r.distanceMeters ?? 0) > 0));

  console.log('\n5b. The number is road distance, not the straight line');
  const measured = destinations
    .map((place) => ({ place, route: matrix.find((r) => r.destinationPlaceId === place.placeId) }))
    .filter((row) => row.route?.status === 'ok' && row.route.distanceMeters !== null);
  check('every routed destination is at least as far by road as by air',
    measured.every((row) => row.route!.distanceMeters! >= Math.round(aerialMeters(origin, row.place))),
    `${measured.length} compared`);
  const detour = measured.find(
    (row) => row.route!.distanceMeters! > aerialMeters(origin, row.place) * 1.05,
  );
  check('and at least one is strictly longer, which an aerial number could never be',
    detour !== undefined,
    detour
      ? `${Math.round(detour.route!.distanceMeters! / 1000)} km by road vs ${Math.round(aerialMeters(origin, detour.place) / 1000)} km by air`
      : 'none');

  console.log('\n6. The whole proposal flow, end to end against Google');
  const proposal = await createTravelService({ places, routes }).propose(origin.placeId, 40, []);
  check('a proposal is produced', proposal.origin.placeId === origin.placeId);
  check('it suggests places inside the driving radius', proposal.suggested.length > 0,
    `${proposal.suggested.length} suggested, ${proposal.excluded.length} excluded`);
  check('every suggestion is within the radius by ROAD',
    proposal.suggested.every((p) => (p.drivingDistanceMeters ?? Infinity) <= 40_000));
  check('nothing beyond the radius slipped into the suggestions',
    !proposal.suggested.some((p) => (p.drivingDistanceMeters ?? 0) > 40_000));

  console.log('\n7. An unroutable destination does not become "too far"');
  const island = await fetch(AUTOCOMPLETE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': googleMaps.apiKey },
    body: JSON.stringify({ input: 'Honolulu, Hawaii' }),
  });
  const islandBody = (await island.json()) as {
    suggestions?: { placePrediction?: { placeId?: string } }[];
  };
  const islandId = (islandBody.suggestions ?? [])[0]?.placePrediction?.placeId;
  check('a destination with no land connection was resolved', typeof islandId === 'string');

  if (islandId) {
    const overseas = await routes.computeRouteMatrix(origin.placeId, [islandId]);
    check('an unreachable destination answers no_route or failed, never a distance',
      overseas.every((r) => r.status !== 'ok' || r.distanceMeters === null),
      overseas.map((r) => r.status).join(','));
  }

  console.log(`\n${failures === 0 ? 'All live checks passed.' : `${failures} live check(s) FAILED.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error: unknown) => {
  console.error('live smoke test threw:', (error as Error).message);
  process.exit(2);
});