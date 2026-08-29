import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { RequestHandler } from 'express';

import { AppError } from '../shared/errors.js';

/**
 * 429 is introduced here. It appeared nowhere in the project before, so there was no existing
 * convention to follow — only the `{ code, message }` contract every other failure already answers,
 * which is why the limiter raises an `AppError` instead of writing its own body.
 */
export const tooManyRequests = (): AppError =>
  new AppError('Too many requests. Please try again later.', 429, 'TOO_MANY_REQUESTS');

const MINUTE = 60 * 1000;

/** Windows and counts are engineering defaults, not approved product values. */
export const AUTH_RATE_LIMITS = {
  login: { windowMs: 15 * MINUTE, limit: 10 },
  register: { windowMs: 60 * MINUTE, limit: 10 },
  forgotPassword: { windowMs: 15 * MINUTE, limit: 5 },
  resetPassword: { windowMs: 15 * MINUTE, limit: 10 },
} as const;

export type AuthRateLimitName = keyof typeof AUTH_RATE_LIMITS;

/**
 * One factory, so a route asks for a named limit rather than carrying a window and a count of its
 * own. `ipKeyGenerator` normalises IPv6 to a /64 block, which stops one client rotating through the
 * addresses of a single prefix to buy itself extra attempts.
 */
export const createAuthRateLimiter = (name: AuthRateLimitName): RequestHandler => {
  const { windowMs, limit } = AUTH_RATE_LIMITS[name];

  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    // Keyed on the caller's IP and never on anything from the body: keying a password-reset
    // limiter on the submitted email would let anyone spend a chosen person's recovery quota.
    // `ipKeyGenerator` normalises IPv6 to a /64, so one client cannot rotate addresses within its
    // own prefix to buy extra attempts.
    keyGenerator: (request) => ipKeyGenerator(request.ip ?? ''),
    handler: (_request, _response, next) => next(tooManyRequests()),
  });
};
