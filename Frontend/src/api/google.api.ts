import { isAxiosError } from 'axios';

import { api } from './client';
import type { ApiErrorBody, LoginResponse } from './types';

/**
 * What the server answers a Google credential with.
 *
 * `onboarding_required` is not a failure. Google can prove who somebody is and nothing else, so a
 * first-time visitor is sent through Blokta's own registration with the verified identity in
 * hand — the trade, the business and the location are still asked for.
 */
export interface GoogleOnboardingProfile {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
}

export type GoogleSignInResult =
  | ({ readonly outcome: 'signed_in' } & LoginResponse)
  | { readonly outcome: 'onboarding_required'; readonly profile: GoogleOnboardingProfile };

export const signInWithGoogle = async (idToken: string): Promise<GoogleSignInResult> => {
  const { data } = await api.post<GoogleSignInResult>('/auth/google', { idToken });
  return data;
};

/** Attaches Google to the account already holding this session. */
export const linkGoogleAccount = async (idToken: string): Promise<{ linkedEmail: string }> => {
  const { data } = await api.post<{ linkedEmail: string }>('/auth/google/link', { idToken });
  return data;
};

/**
 * The cases the screens answer individually. `LINK_REQUIRED` is the one that matters: it is the
 * only one where the person has something specific to do, and it names it.
 */
export type GoogleFailure =
  | 'LINK_REQUIRED'
  | 'IDENTITY_CLAIMED'
  | 'EMAIL_NOT_VERIFIED'
  | 'NOT_CONFIGURED'
  | 'CREDENTIAL'
  | 'NETWORK'
  | 'UNKNOWN';

/**
 * No provider message is ever rendered. Google's own errors are written for developers and can
 * name internals, so the server's code is mapped onto the product's own words.
 */
export const classifyGoogleError = (error: unknown): GoogleFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  const body = error.response.data as ApiErrorBody | undefined;
  switch (body?.code) {
    case 'GOOGLE_LINK_REQUIRED':
      return 'LINK_REQUIRED';
    case 'GOOGLE_IDENTITY_CLAIMED':
    case 'GOOGLE_ALREADY_LINKED':
      return 'IDENTITY_CLAIMED';
    case 'GOOGLE_EMAIL_NOT_VERIFIED':
      return 'EMAIL_NOT_VERIFIED';
    case 'GOOGLE_AUTH_NOT_CONFIGURED':
      return 'NOT_CONFIGURED';
    case 'INVALID_GOOGLE_CREDENTIAL':
    case 'GOOGLE_EMAIL_MISMATCH':
      return 'CREDENTIAL';
    default:
      return 'UNKNOWN';
  }
};