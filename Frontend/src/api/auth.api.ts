import { isAxiosError } from 'axios';

import { api } from './client';
import type {
  ApiErrorBody,
  LoginPayload,
  LoginResponse,
  RegisterPayload,
  RegisterResponse,
} from './types';

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

/**
 * The Login failures this screen answers. There is deliberately **no** case here for "no such
 * account" or "wrong password": the API raises one `INVALID_CREDENTIALS` for both, and adding a
 * client-side distinction would undo the anti-enumeration that answer exists to provide.
 */
export type LoginFailure = 'INVALID_CREDENTIALS' | 'NETWORK' | 'UNKNOWN';

export const login = async (payload: LoginPayload): Promise<LoginResponse> => {
  const { data } = await api.post<LoginResponse>('/auth/login', payload);
  return data;
};

/**
 * `REQUEST_VALIDATION_FAILED` maps onto the same unified answer rather than getting one of its
 * own. The server raises it when the submitted email is not an email or the password is empty —
 * facts about the request, not about any account — and the screen has exactly one thing to say
 * about a sign-in that did not work. Two messages here would be two states to keep unified.
 */
export const classifyLoginError = (error: unknown): LoginFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  const body = error.response.data as ApiErrorBody | undefined;
  if (body?.code === 'INVALID_CREDENTIALS' || body?.code === 'REQUEST_VALIDATION_FAILED') {
    return 'INVALID_CREDENTIALS';
  }
  return 'UNKNOWN';
};
