import { isAxiosError } from 'axios';

import { api } from './client';
import type {
  ApiErrorBody,
  ForgotPasswordPayload,
  LoginPayload,
  LoginResponse,
  RegisterPayload,
  RegisterResponse,
  ResetPasswordPayload,
  StatusResponse,
} from './types';

/** The API error codes this screen answers individually. Anything else falls back to generic. */
export type RegisterFailure =
  | 'EMAIL_ALREADY_REGISTERED'
  | 'REQUEST_VALIDATION_FAILED'
  | 'INVITATION_NOT_FOUND'
  | 'INVITATION_AMBIGUOUS'
  | 'NETWORK'
  | 'UNKNOWN';

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
  // An employee whose employer has not opened a seat for them yet. Saying so is the point: they
  // need to know it is their employer's move, not a mistake they can correct here.
  if (body?.code === 'INVITATION_NOT_FOUND') return 'INVITATION_NOT_FOUND';
  if (body?.code === 'INVITATION_AMBIGUOUS') return 'INVITATION_AMBIGUOUS';
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

/**
 * Requesting a reset link. There is deliberately no success/failure distinction to classify: the
 * server answers the same way for a known address, an unknown one and a suspended account, so the
 * only thing that can go wrong here is not reaching the server at all.
 */
export type ForgotPasswordFailure = 'NETWORK' | 'UNKNOWN';

export const requestPasswordReset = async (payload: ForgotPasswordPayload): Promise<void> => {
  await api.post<StatusResponse>('/auth/forgot-password', payload);
};

export const classifyForgotPasswordError = (error: unknown): ForgotPasswordFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  return error.response ? 'UNKNOWN' : 'NETWORK';
};

/**
 * Setting the new password. `INVALID_RESET_TOKEN` is the server's single answer for a link that is
 * unknown, expired, superseded by a later request, or already used — nothing here re-splits it.
 */
export type ResetPasswordFailure = 'INVALID_RESET_TOKEN' | 'WEAK_PASSWORD' | 'NETWORK' | 'UNKNOWN';

export const resetPassword = async (payload: ResetPasswordPayload): Promise<void> => {
  await api.post<StatusResponse>('/auth/reset-password', payload);
};

export const classifyResetPasswordError = (error: unknown): ResetPasswordFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  const body = error.response.data as ApiErrorBody | undefined;
  if (body?.code === 'INVALID_RESET_TOKEN') return 'INVALID_RESET_TOKEN';
  if (body?.code === 'REQUEST_VALIDATION_FAILED') return 'WEAK_PASSWORD';
  return 'UNKNOWN';
};
