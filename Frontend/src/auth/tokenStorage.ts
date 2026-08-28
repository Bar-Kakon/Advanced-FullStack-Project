/**
 * Where the Access Token lives on the client.
 *
 * Only the Access Token is here. The Refresh Token is set by the server as an HttpOnly cookie,
 * which browser JavaScript cannot read at all — so there is deliberately nothing in this file for
 * it. Copying it into storage would take the long-lived credential out of the one place script
 * cannot reach and put it somewhere script can.
 */

const ACCESS_TOKEN_KEY = 'fieldsync-access-token';

export const getAccessToken = (): string | null => {
  try {
    return localStorage.getItem(ACCESS_TOKEN_KEY);
  } catch {
    // Private windows and blocked site data throw on access rather than returning null.
    return null;
  }
};

export const setAccessToken = (token: string): void => {
  try {
    localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } catch {
    // The session still works for this page load; only surviving a reload is lost.
  }
};

export const clearAccessToken = (): void => {
  try {
    localStorage.removeItem(ACCESS_TOKEN_KEY);
  } catch {
    /* nothing to clean up if storage is unavailable */
  }
};
