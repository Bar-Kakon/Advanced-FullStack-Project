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
  // Limited like a login even though no password is compared: each attempt costs a signature
  // verification against Google's published keys.
  googleSignIn: { windowMs: 15 * MINUTE, limit: 10 },
  register: { windowMs: 60 * MINUTE, limit: 10 },
  forgotPassword: { windowMs: 15 * MINUTE, limit: 5 },
  resetPassword: { windowMs: 15 * MINUTE, limit: 10 },
} as const;

export type AuthRateLimitName = keyof typeof AUTH_RATE_LIMITS;

/** Also an engineering default, not an approved product value. */
export const REPORT_SUBMISSION_RATE_LIMIT = { windowMs: 60 * MINUTE, limit: 10 } as const;

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

/**
 * Report submission sits behind authentication, so the account is the honest key: an IP limit
 * would let one person spend a whole office's quota, and would be evaded by changing network.
 * It falls back to the IP only if the limiter is ever mounted before the auth middleware.
 *
 * Separate from `createAuthRateLimiter` on purpose — the auth windows are production behaviour
 * that verification scripts depend on, and nothing here touches them.
 */
export const createReportRateLimiter = (): RequestHandler =>
  rateLimit({
    ...REPORT_SUBMISSION_RATE_LIMIT,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (request, response) => {
      const auth = response.locals.auth as { userId?: string } | undefined;
      return auth?.userId ?? ipKeyGenerator(request.ip ?? '');
    },
    handler: (_request, _response, next) => next(tooManyRequests()),
  });
