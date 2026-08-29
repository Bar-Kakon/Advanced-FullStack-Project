import { Navigate, Outlet } from 'react-router-dom';

import { WAITING_FOR_APPROVAL, isAwaitingApproval } from '../auth/destination';
import { useAuth } from '../auth/useAuth';

/**
 * The areas that need a live company relationship. The waiting screen sits outside this wrapper
 * and sends an approved employee onward, so neither can bounce into the other.
 */
export const MembershipRoute = () => {
  const { user } = useAuth();

  if (isAwaitingApproval(user)) return <Navigate to={WAITING_FOR_APPROVAL} replace />;

  return <Outlet />;
};
