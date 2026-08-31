import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';

/**
 * The wrapper the walking skeleton has owed since Login became a destination: everything nested
 * under it is reachable only with a session.
 *
 * A signed-out visitor is sent to Login and the address they asked for travels with them in
 * `location.state`, so Login can put them back where they were going instead of always landing
 * them on the dashboard.
 *
 * `replace` keeps the redirect out of the history stack — without it, pressing Back from Login
 * returns to the protected address and bounces straight forward again.
 */
export const PrivateRoute = () => {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return <Outlet />;
};
