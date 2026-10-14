import { isAxiosError } from 'axios';

import { api } from './client';
import type { ApiErrorBody } from './types';

export interface RateableWork {
  readonly id: string;
  readonly title: string;
  readonly completedAt: string;
}

export type RatingFailure = 'NOT_ELIGIBLE' | 'ALREADY_RATED' | 'SUPERSEDED' | 'NETWORK' | 'UNKNOWN';

/** The form's first question: which completed shared work may carry this rating. */
export const fetchRateableWorks = async (rateeUserId: string): Promise<readonly RateableWork[]> => {
  const { data } = await api.get<{ works: readonly RateableWork[] }>(
    `/ratings/eligible-works/${rateeUserId}`,
  );
  return data.works;
};

export const submitRating = async (input: {
  rateeUserId: string;
  workId: string;
  score: number;
  comment?: string;
}): Promise<void> => {
  await api.post('/ratings', input);
};

export const classifyRatingError = (error: unknown): RatingFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  const body = error.response.data as ApiErrorBody | undefined;
  switch (body?.code) {
    case 'RATING_NOT_ELIGIBLE':
    case 'CANNOT_RATE_SELF':
      return 'NOT_ELIGIBLE';
    case 'ALREADY_RATED':
      return 'ALREADY_RATED';
    case 'RATING_CONTEXT_SUPERSEDED':
      return 'SUPERSEDED';
    default:
      return 'UNKNOWN';
  }
};

/** PUB-07: the existing block domain, reached from the public profile. */
export const blockUser = async (userId: string): Promise<void> => {
  await api.put(`/blocks/${userId}`);
};
