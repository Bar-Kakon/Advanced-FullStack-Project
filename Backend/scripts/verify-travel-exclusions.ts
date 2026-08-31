/**
 * A removed travel location stays removed.
 *
 * Sections 1–5 stub Google and the repository, so the proposal rules are proven without quota or a
 * database. Sections 6–9 need a FRESHLY STARTED server and the real database, and prove the same
 * decision survives a write, a reload and a change of radius.
 */
import { config as loadEnvFile } from 'dotenv';

import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { loadConfig } from '../src/config/env.js';
import { UserModel } from '../src/features/users/user.model.js';
import { createLocationService } from '../src/features/location/location.service.js';
import { createTravelService } from '../src/features/location/travel.service.js';
import type { PlacesAdapter } from '../src/features/location/places.adapter.js';
import type { RoutesAdapter } from '../src/features/location/routes.adapter.js';
import type { StructuredPlace } from '../src/features/location/place.types.js';
import type {
  TravelPreferencesRecord,
  TravelPreferencesUpdate,
  UserRepository,
} from '../src/features/users/user.repository.js';
import { userRepository } from '../src/features/users/user.repository.js';
import type { SaveTravelBody } from '../src/features/location/location.validation.js';

const API = process.env['API_URL'] ?? 'http://localhost:3000/api';
const MARKER = 'travel-exclusion-verify';
const PASSWORD = 'CorrectHorse42!';

let failures = 0;
const check = (label: string, passed: boolean, detail = ''): void => {
  if (!passed) failures += 1;
  console.log(`  ${passed ? 'PASS' : 'FAIL'}  ${label.padEnd(70)} ${detail}`);
};

const place = (id: string, name: string): StructuredPlace => ({
  placeId: id, displayName: name, latitude: 32.08, longitude: 34.78,
});

const ORIGIN = place('origin', 'Origin City');
const NEARBY = [place('x', 'Place X'), place('y', 'Place Y'), place('far', 'Far Town')];

const stubPlaces: PlacesAdapter = {
  async resolve() {
    return ORIGIN;
  },
  async nearbyLocalities() {
    return NEARBY;
  },
};

const stubRoutes: RoutesAdapter = {
  async computeRouteMatrix(_origin, destinations) {
    return destinations.map((destinationPlaceId) => ({
      destinationPlaceId,
      distanceMeters: destinationPlaceId === 'far' ? 150_000 : 20_000,
      status: 'ok' as const,
    }));
  },
};

/** An in-memory stand-in for the one user document the service reads and writes. */
const memoryUsers = () => {
  let stored: TravelPreferencesRecord = {
    travelRadiusKm: null, basePlace: null, approvedTravelLocations: [], excludedTravelLocations: [],
  };
  const repository = {
    async findTravelPreferences() {
      return stored;
    },
    async saveTravelPreferences(_id: unknown, update: TravelPreferencesUpdate) {
      stored = {
        travelRadiusKm: update.travelRadiusKm ?? stored.travelRadiusKm,
        basePlace: update.place ?? stored.basePlace,
        approvedTravelLocations: update.approvedTravelLocations,
        excludedTravelLocations: update.excludedTravelLocations,
      };
    },
  } as unknown as UserRepository;

  return { repository, read: (): TravelPreferencesRecord => stored };
};

const approved = (id: string, name: string, source: 'suggested' | 'manual') => ({
  placeId: id, displayName: name, latitude: 32.08, longitude: 34.78, source,
});

const ACTOR = '000000000000000000000001';

interface Reply { readonly status: number; readonly body: Record<string, any>; readonly raw: string }

const send = async (method: string, path: string, payload?: unknown, token?: string): Promise<Reply> => {
  const response = await fetch(`${API}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(payload === undefined ? {} : { body: JSON.stringify(payload) }),
  });
  const raw = await response.text();
  if (response.status === 429) throw new Error(`Rate limited on ${path}. Restart the API and retry.`);

  let body: Record<string, any> = {};
  try {
    body = JSON.parse(raw) as Record<string, any>;
  } catch {
    body = {};
  }
  return { status: response.status, body, raw };
};

const run = async (): Promise<void> => {
  const travel = createTravelService({ places: stubPlaces, routes: stubRoutes });

  console.log('\n1. The radius proposal contains Place X before anything is removed');
  const first = await travel.propose('origin', 50, []);
  check('X is suggested', first.suggested.some((p) => p.placeId === 'x'));
  check('Y is suggested too', first.suggested.some((p) => p.placeId === 'y'));
  check('the distant town is not suggested', !first.suggested.some((p) => p.placeId === 'far'));
  check('nothing is reported as previously removed yet', first.previouslyRemoved.length === 0);

  console.log('\n2. The person removes X and confirms');
  const store = memoryUsers();
  const locations = createLocationService({ users: store.repository });
  const confirmed: SaveTravelBody = {
    travelRadiusKm: 50,
    approvedTravelLocations: [approved('y', 'Place Y', 'suggested')],
    removedTravelLocations: [{ placeId: 'x', displayName: 'Place X' }],
  };
  await locations.saveTravelPreferences(ACTOR, confirmed);

  check('the approved list holds Y and not X',
    store.read().approvedTravelLocations.map((p) => p.placeId).join() === 'y');
  check('the removal is persisted as an exclusion',
    store.read().excludedTravelLocations.some((p) => p.placeId === 'x'));
  check('the exclusion carries the name, so it can be shown back',
    store.read().excludedTravelLocations[0]?.displayName === 'Place X');
  check('the exclusion is stamped',
    store.read().excludedTravelLocations[0]?.excludedAt instanceof Date);
  check('excludedPlaceIds reports exactly what the proposal must skip',
    (await locations.excludedPlaceIds(ACTOR)).join() === 'x');

  console.log('\n3. The same proposal runs again — X is rediscovered but never suggested');
  const removedIds = await locations.excludedPlaceIds(ACTOR);
  const second = await travel.propose('origin', 50, removedIds);
  check('Google still returns X internally',
    NEARBY.some((p) => p.placeId === 'x'));
  check('X is NOT suggested', !second.suggested.some((p) => p.placeId === 'x'));
  check('X is NOT in the ordinary excluded bucket either',
    !second.excluded.some((p) => p.placeId === 'x'));
  check('X is reported as previously removed, so the list is not silently lossy',
    second.previouslyRemoved.some((p) => p.placeId === 'x'));
  check('its road distance is still known, proving it was measured, not skipped',
    second.previouslyRemoved.find((p) => p.placeId === 'x')?.drivingDistanceMeters === 20_000);
  check('Y is still suggested', second.suggested.some((p) => p.placeId === 'y'));

  console.log('\n4. Changing the radius does not erase the decision');
  await locations.saveTravelPreferences(ACTOR, {
    travelRadiusKm: 200,
    approvedTravelLocations: [approved('y', 'Place Y', 'suggested')],
  });
  check('the exclusion survives a save that mentions no removals',
    (await locations.excludedPlaceIds(ACTOR)).join() === 'x');
  const wider = await travel.propose('origin', 200, await locations.excludedPlaceIds(ACTOR));
  check('the wider radius now reaches the distant town',
    wider.suggested.some((p) => p.placeId === 'far'));
  check('and X is STILL not suggested at the wider radius',
    !wider.suggested.some((p) => p.placeId === 'x'));

  console.log('\n5. A manual re-add is the one way back');
  await locations.saveTravelPreferences(ACTOR, {
    travelRadiusKm: 50,
    approvedTravelLocations: [
      approved('y', 'Place Y', 'suggested'),
      approved('x', 'Place X', 'manual'),
      approved('x', 'Place X', 'manual'),
    ],
  });
  check('X is approved again', store.read().approvedTravelLocations.some((p) => p.placeId === 'x'));
  check('and it appears exactly once, not twice',
    store.read().approvedTravelLocations.filter((p) => p.placeId === 'x').length === 1);
  check('approving it cleared the exclusion',
    (await locations.excludedPlaceIds(ACTOR)).length === 0);
  check('it is recorded as a manual choice, not a suggestion',
    store.read().approvedTravelLocations.find((p) => p.placeId === 'x')?.source === 'manual');
  const third = await travel.propose('origin', 50, await locations.excludedPlaceIds(ACTOR));
  check('the proposal suggests X again now that the person asked for it',
    third.suggested.some((p) => p.placeId === 'x'));

  console.log('\n5b. A manually added place outside the radius stays approved');
  await locations.saveTravelPreferences(ACTOR, {
    travelRadiusKm: 50,
    approvedTravelLocations: [
      approved('y', 'Place Y', 'suggested'),
      approved('far', 'Far Town', 'manual'),
    ],
    removedTravelLocations: [{ placeId: 'x', displayName: 'Place X' }],
  });
  check('the far town is approved even though 150 km is well outside 50 km',
    store.read().approvedTravelLocations.some((p) => p.placeId === 'far'));
  check('and removing X again re-excludes it',
    (await locations.excludedPlaceIds(ACTOR)).join() === 'x');

  console.log('\n5c. Approving wins over removing when a save says both');
  await locations.saveTravelPreferences(ACTOR, {
    approvedTravelLocations: [approved('x', 'Place X', 'manual')],
    removedTravelLocations: [{ placeId: 'x', displayName: 'Place X' }],
  });
  check('a contradictory save leaves X approved, not excluded',
    store.read().approvedTravelLocations.some((p) => p.placeId === 'x')
    && (await locations.excludedPlaceIds(ACTOR)).length === 0);

  loadEnvFile({ quiet: true });
  await connectToDatabase(loadConfig().mongoUri);
  await UserModel.deleteMany({ email: { $regex: `^${MARKER}` } }).exec();

  console.log('\n6. The same decision, over the real API and the real database');
  const email = `${MARKER}@example.com`;
  const registered = await send('POST', '/auth/register', {
    firstName: 'Travel', lastName: 'Tester', standing: 'owner', companyName: 'Travel Verify Ltd',
    email, password: PASSWORD, confirmPassword: PASSWORD,
    registrationCategory: 'contractor', specialty: 'electrical', city: 'חיפה', region: 'haifa',
    availability: 'open', acceptedTerms: true, operationalEmail: true,
  });
  if (registered.status !== 201) throw new Error(`register: ${JSON.stringify(registered.body)}`);
  const signedIn = await send('POST', '/auth/login', { email, password: PASSWORD });
  const token = signedIn.body['accessToken'] as string;
  const userId = signedIn.body['user'].id as string;

  const saved = await send('PUT', '/location/travel', {
    travelRadiusKm: 50,
    approvedTravelLocations: [
      { ...approved('y', 'Place Y', 'suggested'), drivingDistanceMeters: 20_000 },
    ],
    removedTravelLocations: [{ placeId: 'x', displayName: 'Place X' }],
  }, token);
  check('the API accepts a removal alongside the approved list', saved.status === 200, `${saved.status}`);

  const row = await UserModel.findById(userId).lean<Record<string, any>>().exec();
  check('the exclusion reached the database',
    (row?.['excludedTravelLocations'] ?? []).some((p: any) => p.placeId === 'x'));
  check('the approved list reached the database',
    (row?.['approvedTravelLocations'] ?? []).some((p: any) => p.placeId === 'y'));

  console.log('\n7. Reloading the profile returns the decision, and never the exclusions');
  const profile = await send('GET', `/browse/contractors/${userId}`, undefined, token);
  const returned = (profile.body['profile']?.approvedTravelLocations ?? []) as { placeId: string }[];
  check('the public profile now carries the approved list', returned.length === 1, `${returned.length} entries`);
  check('and it is Y, the place that was kept', returned[0]?.placeId === 'y');
  check('X is absent from the reloaded profile', !returned.some((p) => p.placeId === 'x'));
  check('the private exclusion list is nowhere in the response',
    !profile.raw.includes('excludedTravelLocations') && !profile.raw.includes('Place X'));

  console.log('\n7b. The editor reads its own saved answers back');
  const mine = await send('GET', '/location/travel', undefined, token);
  check('the person may read their own travel preferences', mine.status === 200, `${mine.status}`);
  check('the saved radius comes back', mine.body['travelRadiusKm'] === 50);
  check('the approved list comes back',
    (mine.body['approvedTravelLocations'] ?? []).some((p: any) => p.placeId === 'y'));
  check('and their own removals come back, so the editor can explain them',
    (mine.body['previouslyRemoved'] ?? []).some((p: any) => p.placeId === 'x'));

  const stranger = await send('GET', '/location/travel');
  check('an unauthenticated caller gets nothing', stranger.status === 401, `${stranger.status}`);

  console.log('\n8. A later save at a different radius does not resurrect X');
  await send('PUT', '/location/travel', {
    travelRadiusKm: 150,
    approvedTravelLocations: [
      { ...approved('y', 'Place Y', 'suggested'), drivingDistanceMeters: 20_000 },
    ],
  }, token);
  const afterWidening = await UserModel.findById(userId).lean<Record<string, any>>().exec();
  check('X is still excluded after the radius changed',
    (afterWidening?.['excludedTravelLocations'] ?? []).some((p: any) => p.placeId === 'x'));
  check('and the stored radius did change, so the save really happened',
    afterWidening?.['location']?.travelRadiusKm === 150);

  console.log('\n9. A manual re-add through the API clears the exclusion');
  await send('PUT', '/location/travel', {
    travelRadiusKm: 150,
    approvedTravelLocations: [
      { ...approved('y', 'Place Y', 'suggested'), drivingDistanceMeters: 20_000 },
      approved('x', 'Place X', 'manual'),
    ],
  }, token);
  const afterReadd = await UserModel.findById(userId).lean<Record<string, any>>().exec();
  const approvedIds = (afterReadd?.['approvedTravelLocations'] ?? []).map((p: any) => p.placeId);
  check('X is approved again', approvedIds.includes('x'));
  check('exactly one row for X, no duplicate Place ID',
    approvedIds.filter((id: string) => id === 'x').length === 1);
  check('the exclusion list is empty again',
    (afterReadd?.['excludedTravelLocations'] ?? []).length === 0);

  const reloaded = await send('GET', `/browse/contractors/${userId}`, undefined, token);
  const reloadedIds = ((reloaded.body['profile']?.approvedTravelLocations ?? []) as { placeId: string }[])
    .map((p) => p.placeId);
  check('and the reloaded profile agrees', reloadedIds.includes('x') && reloadedIds.includes('y'));

  await UserModel.deleteMany({ email: { $regex: `^${MARKER}` } }).exec();
  await disconnectFromDatabase();

  console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) FAILED.`}\n`);
  process.exit(failures === 0 ? 0 : 1);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(2);
});
