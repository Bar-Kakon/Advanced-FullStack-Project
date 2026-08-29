import { isAxiosError } from 'axios';

import { api } from './client';
import type { ApiErrorBody, Availability, CompanyPosition, Region, Trade } from './types';

export interface ReceivedRatingDto {
  readonly id: string;
  readonly score: number;
  readonly date: string;
  readonly body: string;
}

export interface WorkEntry {
  readonly id: string;
  readonly title: string;
  readonly scope?: string;
  readonly meta: string;
  readonly onFieldSync: boolean;
  readonly imageUrl: string | null;
}

/** Mirrored from `profile.dto.ts`. Every field is whatever the server holds, or `null`. */
export interface Profile {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly language: 'he' | 'en';
  readonly profileComplete: boolean;

  readonly bio: string;
  readonly specialties: readonly Trade[];
  readonly specialtyOther: string;
  readonly businessPhone: string;
  readonly city: string;
  readonly region: Region | null;
  readonly travelRadiusKm: number | null;
  readonly delayToleranceDays: number | null;
  readonly noticeRequiredDays: number | null;
  readonly avatarUrl: string | null;

  readonly companyName: string | null;
  readonly officePhone: string | null;
  readonly availability: Availability | null;

  readonly standing: 'owner' | 'employee' | null;
  readonly companyPosition: CompanyPosition | null;
  readonly companyMembershipActive: boolean;

  /*
   * The server sends `null` for all three today — no ratings domain exists, and flexibility has no
   * approved arithmetic. The shapes are declared so the panels that render them stay compiled
   * against the real contract; a `null` is what makes them show their empty mark.
   */
  readonly rating: { readonly value: number; readonly count: number } | null;
  readonly flexibility: {
    readonly score: number;
    readonly responses: number;
    readonly updatedMonth: string;
  } | null;
  readonly ratings: readonly ReceivedRatingDto[];
  readonly work: readonly WorkEntry[];
}

export interface ProfilePatch {
  firstName?: string;
  lastName?: string;
  bio?: string;
  specialties?: readonly Trade[];
  specialtyOther?: string | null;
  businessPhone?: string | null;
  city?: string;
  region?: Region;
  travelRadiusKm?: number;
  delayToleranceDays?: number;
  noticeRequiredDays?: number;
}

export interface CompanyPatch {
  name?: string;
  officePhone?: string | null;
  availability?: Availability;
}

export const fetchMyProfile = async (signal?: AbortSignal): Promise<Profile> => {
  const { data } = await api.get<{ user: Profile }>('/users/me', signal ? { signal } : {});
  return data.user;
};

export const updateMyProfile = async (patch: ProfilePatch): Promise<Profile> => {
  const { data } = await api.patch<{ user: Profile }>('/users/me', patch);
  return data.user;
};

/** Company name, office phone and availability live on the company, so they patch its own route. */
export const updateMyCompany = async (patch: CompanyPatch): Promise<Profile> => {
  const { data } = await api.patch<{ user: Profile }>('/companies/me', patch);
  return data.user;
};

export const uploadAvatar = async (file: File): Promise<Profile> => {
  const form = new FormData();
  form.append('avatar', file);

  const { data } = await api.put<{ user: Profile }>('/users/me/avatar', form);
  return data.user;
};

export const removeAvatar = async (): Promise<Profile> => {
  const { data } = await api.delete<{ user: Profile }>('/users/me/avatar');
  return data.user;
};

export const addWorkEntry = async (
  entry: { title: string; scope?: string; meta: string },
  image?: File | null,
): Promise<WorkEntry> => {
  const form = new FormData();
  form.append('title', entry.title);
  form.append('meta', entry.meta);
  if (entry.scope) form.append('scope', entry.scope);
  if (image) form.append('image', image);

  const { data } = await api.post<{ entry: WorkEntry }>('/users/me/work-entries', form);
  return data.entry;
};

export const removeWorkEntry = async (id: string): Promise<void> => {
  await api.delete(`/users/me/work-entries/${id}`);
};

export type ProfileFailure =
  | 'UNAUTHENTICATED'
  | 'UNSUPPORTED_FILE_TYPE'
  | 'FILE_TOO_LARGE'
  | 'FILE_NOT_FOUND'
  | 'NOT_PERMITTED'
  | 'NO_COMPANY'
  | 'VALIDATION'
  | 'NETWORK'
  | 'UNKNOWN';

export const isAbortError = (error: unknown): boolean =>
  (isAxiosError(error) && error.code === 'ERR_CANCELED') ||
  (error instanceof Error && error.name === 'CanceledError');

/** The no-response case comes first: an unreachable API must not read as a rejected file. */
export const classifyProfileError = (error: unknown): ProfileFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  const body = error.response.data as ApiErrorBody | undefined;
  switch (body?.code) {
    case 'UNAUTHENTICATED':
      return 'UNAUTHENTICATED';
    case 'UNSUPPORTED_FILE_TYPE':
    case 'UNEXPECTED_FILE_FIELD':
      return 'UNSUPPORTED_FILE_TYPE';
    case 'FILE_TOO_LARGE':
      return 'FILE_TOO_LARGE';
    case 'FILE_NOT_FOUND':
      return 'FILE_NOT_FOUND';
    case 'COMPANY_PERMISSION_DENIED':
      return 'NOT_PERMITTED';
    case 'NO_ACTIVE_COMPANY':
      return 'NO_COMPANY';
    case 'REQUEST_VALIDATION_FAILED':
      return 'VALIDATION';
    default:
      return error.response.status === 413 ? 'FILE_TOO_LARGE' : 'UNKNOWN';
  }
};
