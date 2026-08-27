import type { CorsOptions } from 'cors';

/**
 * A request with no `Origin` header is not a browser cross-origin request (curl, a platform
 * health check, server-to-server), so CORS has nothing to decide about it.
 */
export const createCorsOptions = (allowedOrigins: readonly string[]): CorsOptions => ({
  origin: (origin, callback) => {
    callback(null, origin === undefined || allowedOrigins.includes(origin));
  },
});
