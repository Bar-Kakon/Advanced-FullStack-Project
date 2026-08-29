import axios from 'axios';

import { getAccessToken } from '../auth/tokenStorage';

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
