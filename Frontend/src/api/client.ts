import axios, { type InternalAxiosRequestConfig } from 'axios';

import { clearStoredUser } from '../auth/session';
import { clearAccessToken, getAccessToken, setAccessToken } from '../auth/tokenStorage';

/**
 * The one HTTP client the whole app uses. Every call goes through it so that the base URL, the
 * credential policy and the Authorization header are decided once instead of per call site — the
 * day one of them changes, this file is the only edit.
 */

const baseURL = import.meta.env.VITE_API_URL;

if (!baseURL) {
  // Failing loudly at startup beats every request 404ing against the dev server's own origin,
  // which is what an undefined baseURL silently produces.
  throw new Error('VITE_API_URL is not set. Copy Frontend/.env.example to Frontend/.env.');
}

export const api = axios.create({
  baseURL,
  /**
   * Lets the browser store the Refresh Token cookie the API sets, and send it back on a later
   * refresh call. Without it the cookie is dropped on a cross-origin response and the session
   * could never be renewed. It is only safe because the server's CORS origin is a strict
   * allowlist — `credentials` and a wildcard origin are mutually exclusive, by specification.
   */
  withCredentials: true,
});

/**
 * Runs before every request leaves. Attaching the token here rather than at each call site means a
 * future endpoint cannot forget it and fail with a 401 nobody can explain.
 *
 * Register itself is unauthenticated, so on that call there is simply no token yet and no header
 * is added — which is correct, not a special case.
 */
api.interceptors.request.use((config) => {
  const token = getAccessToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

/** Fired when the session could not be renewed, so the auth provider rereads empty storage. */
export const SESSION_EXPIRED_EVENT = 'auth:session-expired';

/**
 * Routes whose 401 means something other than "the Access Token expired": wrong credentials, a
 * spent refresh cookie, a bad Google token. Refreshing on those would loop, not recover.
 */
const AUTH_PATHS = ['/auth/login', '/auth/logout', '/auth/refresh', '/auth/google'];

const isAuthPath = (url: string | undefined): boolean =>
  url !== undefined && AUTH_PATHS.some((path) => url === path || url.startsWith(`${path}/`));

let refreshInFlight: Promise<string | null> | null = null;

/**
 * One refresh at a time. Every 401 that lands while it runs awaits the same promise, so a page of
 * parallel requests renews the session once instead of racing the rotating cookie against itself.
 * The call goes through a bare axios request, never through `api`, so it cannot intercept itself.
 */
const refreshAccessToken = (): Promise<string | null> => {
  if (refreshInFlight === null) {
    refreshInFlight = axios
      .post<{ accessToken: string }>(`${baseURL}/auth/refresh`, undefined, { withCredentials: true })
      .then((response) => response.data.accessToken)
      .catch(() => null);
    void refreshInFlight.finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
};

interface RetriableConfig extends InternalAxiosRequestConfig {
  retriedAfterRefresh?: boolean;
}

/**
 * Runs on every failed response. A 401 from an ordinary route means the Access Token expired, so
 * the session is renewed through the Refresh Token cookie and the original request is retried
 * exactly once. When renewal fails the device is signed out and the screens are told so — the
 * application state is preserved whenever the session can be restored, and only then.
 */
api.interceptors.response.use(undefined, async (error: unknown) => {
  if (!axios.isAxiosError(error)) throw error;

  const config = error.config as RetriableConfig | undefined;
  if (
    error.response?.status !== 401 ||
    config === undefined ||
    config.retriedAfterRefresh === true ||
    isAuthPath(config.url) ||
    getAccessToken() === null
  ) {
    throw error;
  }

  const token = await refreshAccessToken();
  if (token === null) {
    clearAccessToken();
    clearStoredUser();
    window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
    throw error;
  }

  setAccessToken(token);
  config.retriedAfterRefresh = true;
  config.headers.Authorization = `Bearer ${token}`;
  return api.request(config);
});
