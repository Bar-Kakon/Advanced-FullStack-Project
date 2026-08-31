import { useContext } from 'react';

import { AuthContext, type AuthValue } from './AuthContext';

/**
 * The only way a component reads the session. The null check turns "rendered outside the
 * provider" into one clear error at the point of the mistake, instead of a screen quietly
 * behaving as though nobody were signed in.
 */
export const useAuth = (): AuthValue => {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>.');
  return value;
};
