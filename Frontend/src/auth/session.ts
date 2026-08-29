import type { SessionUser } from '../api/types';

/**
 * Where the signed-in person's identity is kept between page loads.
 *
 * It sits beside `tokenStorage` rather than inside it because the two answer different questions:
 * the token says *may this request be made*, this says *who is on screen*. Neither is a source of
 * truth about the account — the server is — and nothing here is trusted for authorization, which
 * is exactly why storing it in the browser is safe. It is a cache of what Login already told us,
 * so a reload does not blank the navbar while the first request is in flight.
 */

/** Exported for the same reason as `ACCESS_TOKEN_KEY`. */
export const USER_KEY = 'fieldsync-user';

export const readStoredUser = (): SessionUser | null => {
  try {
    const raw = localStorage.getItem(USER_KEY);
    if (raw === null) return null;

    const parsed = JSON.parse(raw) as Partial<SessionUser>;
    // A stored shape from an older build is discarded rather than half-rendered. `company` is
    // checked for presence rather than truth, because `null` is one of its real answers.
    if (typeof parsed.id !== 'string' || typeof parsed.email !== 'string') return null;
    if (!('company' in parsed)) return null;
    return parsed as SessionUser;
  } catch {
    // Private windows throw on access, and a hand-edited value throws on parse. Both mean
    // "nobody is signed in as far as this device can tell", which is the safe answer.
    return null;
  }
};

export const storeUser = (user: SessionUser): void => {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  } catch {
    // The session still works for this page load; only surviving a reload is lost.
  }
};

export const clearStoredUser = (): void => {
  try {
    localStorage.removeItem(USER_KEY);
  } catch {
    /* nothing to clean up if storage is unavailable */
  }
};
