import { isAxiosError } from 'axios';

import { api } from './client';
import type { ApiErrorBody, RegisterPayload, RegisterResponse } from './types';

/** The API error codes this screen answers individually. Anything else falls back to generic. */
export type RegisterFailure = 'EMAIL_ALREADY_REGISTERED' | 'REQUEST_VALIDATION_FAILED' | 'NETWORK' | 'UNKNOWN';

export const registerAccount = async (payload: RegisterPayload): Promise<RegisterResponse> => {
  const { data } = await api.post<RegisterResponse>('/auth/register', payload);
  return data;
};

/**
 * Turns whatever Axios threw into one of the four cases the screen knows how to render.
 *
 * The distinction that matters is the middle one: a request that never reached the server has no
 * response at all, so reading `error.response.data.code` on it would itself throw. Telling someone
 * their email is taken when the real problem is that the API is not running is the failure this
 * function exists to prevent.
 */
export const classifyRegisterError = (error: unknown): RegisterFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  const body = error.response.data as ApiErrorBody | undefined;
  if (body?.code === 'EMAIL_ALREADY_REGISTERED') return 'EMAIL_ALREADY_REGISTERED';
  if (body?.code === 'REQUEST_VALIDATION_FAILED') return 'REQUEST_VALIDATION_FAILED';
  return 'UNKNOWN';
};
