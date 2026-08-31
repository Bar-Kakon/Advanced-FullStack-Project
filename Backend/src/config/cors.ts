import type { CorsOptions } from 'cors';

/**
 * A request with no `Origin` header is not a browser cross-origin request (curl, a platform
 * health check, server-to-server), so CORS has nothing to decide about it.
 *
 * `credentials` is what allows the browser to send and store the HttpOnly Refresh Token cookie on a
 * cross-origin call. It is safe only because `origin` is a strict allowlist and never `*` — the two
 * settings have to be read together.
 */
export const createCorsOptions = (allowedOrigins: readonly string[]): CorsOptions => ({
  origin: (origin, callback) => {
    callback(null, origin === undefined || allowedOrigins.includes(origin));
  },
  credentials: true,
});
