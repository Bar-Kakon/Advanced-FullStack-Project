import { Outlet } from 'react-router-dom';

import { useAuth } from '../auth/useAuth';
import { NotFoundPage } from '../features/errors/NotFoundPage';

/**
 * The moderation area. It renders the ordinary not-found screen rather than redirecting, which
 * matches what the API answers: a caller without platform authority is told the address is not
 * available, never that it exists and is forbidden.
 *
 * It is a guard, not the authorization. Every moderation request is refused on its own by the
 * server, which reads `isAdmin` from the account — so a client that faked the flag would reach
 * this layout and then be answered 404 by every call it made.
 */
export const AdminRoute = () => {
  const { user } = useAuth();

  if (user?.isAdmin !== true) return <NotFoundPage />;

  return <Outlet />;
};
