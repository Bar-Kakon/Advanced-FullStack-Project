import { isAxiosError } from 'axios';

import { api } from './client';
import type { ApiErrorBody } from './types';
import type { SubmitContactFailure, SubmitContactPayload, SubmitContactResponse } from './contact.types';

export const submitContactMessage = async (
  payload: SubmitContactPayload,
): Promise<SubmitContactResponse> => {
  const { data } = await api.post<SubmitContactResponse>('/contact/messages', payload);
  return data;
};

/**
 * Turns whatever Axios threw into one of the cases the form can word. A request that never reached
 * the server carries no response at all, so reading a code off it would itself throw.
 */
export const classifySubmitContactError = (error: unknown): SubmitContactFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  const code = (error.response.data as ApiErrorBody | undefined)?.code;
  if (code === 'TOO_MANY_REQUESTS') return 'TOO_MANY_REQUESTS';
  if (code === 'REQUEST_VALIDATION_FAILED') return 'REQUEST_VALIDATION_FAILED';
  return 'UNKNOWN';
};
