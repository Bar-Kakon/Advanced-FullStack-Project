import { isAxiosError } from 'axios';

import { api } from './client';
import type { ApiErrorBody } from './types';
import type {
  ApprovedTravelLocationPayload,
  BrowseFilters,
  BrowsePage,
  MyTravelPreferences,
  PublicProfile,
  RemovedTravelLocationPayload,
  TravelProposal,
} from './browse.types';

const toParams = (filters: BrowseFilters, cursor: string | null, limit: number): URLSearchParams => {
  const params = new URLSearchParams();
  params.set('limit', String(limit));

  if (filters.q.trim()) params.set('q', filters.q.trim());
  for (const code of filters.specialties) params.append('specialty', code);
  for (const code of filters.regions) params.append('region', code);
  for (const code of filters.availability) params.append('availability', code);
  if (filters.approvedPlace) params.set('placeId', filters.approvedPlace.placeId);
  if (filters.origin && filters.maxDrivingKm) {
    params.set('originPlaceId', filters.origin.placeId);
    params.set('maxDrivingKm', String(filters.maxDrivingKm));
  }
  if (filters.minRating) params.set('minRating', String(filters.minRating));
  if (filters.sort !== 'relevance') params.set('sort', filters.sort);
  if (cursor) params.set('cursor', cursor);

  return params;
};

/** `signal` lets a superseded request be aborted, so a slow answer cannot overwrite a newer one. */
export const searchContractors = async (
  filters: BrowseFilters,
  cursor: string | null,
  limit: number,
  signal?: AbortSignal,
): Promise<BrowsePage> => {
  const { data } = await api.get<BrowsePage>('/browse/contractors', {
    params: toParams(filters, cursor, limit),
    ...(signal ? { signal } : {}),
  });
  return data;
};

export const fetchPublicProfile = async (
  userId: string,
  signal?: AbortSignal,
): Promise<PublicProfile> => {
  const { data } = await api.get<{ profile: PublicProfile }>(
    `/browse/contractors/${userId}`,
    signal ? { signal } : {},
  );
  return data.profile;
};

export const requestConnection = async (userId: string): Promise<void> => {
  await api.post(`/connections/${userId}/request`);
};

export const fetchMyTravelPreferences = async (
  signal?: AbortSignal,
): Promise<MyTravelPreferences> => {
  const { data } = await api.get<MyTravelPreferences>(
    '/location/travel',
    signal ? { signal } : {},
  );
  return data;
};

export const proposeTravelLocations = async (
  originPlaceId: string,
  travelRadiusKm: number,
): Promise<TravelProposal> => {
  const { data } = await api.post<TravelProposal>('/location/travel/proposal', {
    originPlaceId,
    travelRadiusKm,
  });
  return data;
};

export const saveTravelPreferences = async (payload: {
  travelRadiusKm?: number;
  basePlace?: ApprovedTravelLocationPayload;
  approvedTravelLocations: readonly ApprovedTravelLocationPayload[];
  removedTravelLocations?: readonly RemovedTravelLocationPayload[];
}): Promise<void> => {
  await api.put('/location/travel', payload);
};

export type BrowseFailure =
  | 'LOCATION_SERVICE_UNAVAILABLE'
  | 'LOCATION_SERVICE_NOT_CONFIGURED'
  | 'INVALID_PLACE_ID'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'NETWORK'
  | 'UNKNOWN';

/** An aborted request is not a failure — it is a newer one having taken over. */
export const isAbortError = (error: unknown): boolean =>
  (isAxiosError(error) && error.code === 'ERR_CANCELED') ||
  (error instanceof Error && error.name === 'CanceledError');

export const classifyBrowseError = (error: unknown): BrowseFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  const body = error.response.data as ApiErrorBody | undefined;
  switch (body?.code) {
    case 'LOCATION_SERVICE_UNAVAILABLE':
      return 'LOCATION_SERVICE_UNAVAILABLE';
    case 'LOCATION_SERVICE_NOT_CONFIGURED':
      return 'LOCATION_SERVICE_NOT_CONFIGURED';
    case 'INVALID_PLACE_ID':
      return 'INVALID_PLACE_ID';
    case 'CONTRACTOR_NOT_FOUND':
      return 'NOT_FOUND';
    case 'REQUEST_VALIDATION_FAILED':
      return 'VALIDATION';
    default:
      return 'UNKNOWN';
  }
};