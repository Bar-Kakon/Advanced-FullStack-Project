import { createContext, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';

import { logout } from '../api/auth.api';
import type { LoginResponse, SessionUser } from '../api/types';
import { ACCESS_TOKEN_KEY, clearAccessToken, getAccessToken, setAccessToken } from './tokenStorage';
import { USER_KEY, clearStoredUser, readStoredUser, storeUser } from './session';

/**
 * The one place the app decides whether somebody is signed in, and who.
 *
 * It wraps the existing token storage rather than replacing it: `tokenStorage` still owns the
 * Access Token, and the Refresh Token is still an HttpOnly cookie this code cannot see. What this
 * adds is the identity Login returns alongside the token, so the navbar and the profile screens
 * can render a name without a request of their own — there is no endpoint that would serve one.
 *
 * **It keeps no copy of either value.** `user` and `isAuthenticated` are read from storage on
 * demand, and the only React state here is a counter saying "storage moved, read it again". An
 * earlier version cached a `hasToken` boolean alongside the store, which is a second answer to a
 * question that already had one — and it went stale the moment anything cleared the token without
 * going through this provider.
 *
 * `isAuthenticated` is deliberately "there is a token on this device", not "the server agrees".
 * Only the server can answer the second question, and it does, on every protected request. A
 * client-side gate exists to keep a signed-out visitor off an authenticated screen, never to be
 * the check that protects the data.
 */
export interface AuthValue {
  readonly user: SessionUser | null;
  readonly isAuthenticated: boolean;
  signIn(response: LoginResponse): void;
  /** Replaces the cached identity with a fresher read of the same thing. No token is touched. */
  setUser(user: SessionUser): void;
  signOut(): Promise<void>;
}

export const AuthContext = createContext<AuthValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [revision, setRevision] = useState(0);
  const reread = useCallback(() => setRevision((current) => current + 1), []);

  // Another tab signing in or out writes the same storage. Without this, one tab would keep
  // rendering a session the other has already ended.
  useEffect(() => {
    const onStorage = (event: StorageEvent): void => {
      if (event.key === null || event.key === ACCESS_TOKEN_KEY || event.key === USER_KEY) reread();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [reread]);

  const signIn = useCallback(
    (response: LoginResponse): void => {
      // Stored before the screen advances, so the very next request is already authenticated.
      setAccessToken(response.accessToken);
      storeUser(response.user);
      reread();
    },
    [reread],
  );

  // Where a fresh `/auth/me` read lands, for a relationship that changed elsewhere.
  const setUser = useCallback(
    (user: SessionUser): void => {
      storeUser(user);
      reread();
    },
    [reread],
  );

  /**
   * The server is asked first, so the refresh cookie and its token family are really gone. The
   * local clear happens either way: a failed request must never leave somebody looking signed in
   * with credentials they asked to give up.
   */
  const signOut = useCallback(async (): Promise<void> => {
    try {
      await logout();
    } catch (error) {
      console.error('Sign-out could not reach the server; clearing this device anyway.', error);
    } finally {
      clearAccessToken();
      clearStoredUser();
      reread();
    }
  }, [reread]);

  const value = useMemo<AuthValue>(
    () => ({
      user: readStoredUser(),
      isAuthenticated: getAccessToken() !== null,
      signIn,
      setUser,
      signOut,
    }),
    // `revision` is the dependency doing the work: it changes when storage does, and nothing else
    // here is derived from React state.
    [revision, signIn, setUser, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
