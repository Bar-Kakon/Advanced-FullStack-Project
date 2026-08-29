import { createContext, useCallback, useMemo, useState, type ReactNode } from 'react';

import type { AuthenticatedUser, LoginResponse } from '../api/types';
import { clearAccessToken, getAccessToken, setAccessToken } from './tokenStorage';
import { clearStoredUser, readStoredUser, storeUser } from './session';

/**
 * The one place the app decides whether somebody is signed in, and who.
 *
 * It wraps the existing token storage rather than replacing it: `tokenStorage` still owns the
 * Access Token, and the Refresh Token is still an HttpOnly cookie this code cannot see. What this
 * adds is the identity Login returns alongside the token, so the navbar and the profile screens
 * can render a name without a request of their own — there is no endpoint that would serve one.
 *
 * `isAuthenticated` is deliberately "there is a token on this device", not "the server agrees".
 * Only the server can answer the second question, and it does, on every protected request. A
 * client-side gate exists to keep a signed-out visitor off an authenticated screen, never to be
 * the check that protects the data.
 */
export interface AuthValue {
  readonly user: AuthenticatedUser | null;
  readonly isAuthenticated: boolean;
  signIn(response: LoginResponse): void;
  signOut(): void;
}

export const AuthContext = createContext<AuthValue | null>(null);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<AuthenticatedUser | null>(readStoredUser);
  const [hasToken, setHasToken] = useState<boolean>(() => getAccessToken() !== null);

  const signIn = useCallback((response: LoginResponse): void => {
    // Stored before the screen advances, so the very next request is already authenticated.
    setAccessToken(response.accessToken);
    storeUser(response.user);
    setUser(response.user);
    setHasToken(true);
  }, []);

  const signOut = useCallback((): void => {
    clearAccessToken();
    clearStoredUser();
    setUser(null);
    setHasToken(false);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user, isAuthenticated: hasToken, signIn, signOut }),
    [user, hasToken, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
