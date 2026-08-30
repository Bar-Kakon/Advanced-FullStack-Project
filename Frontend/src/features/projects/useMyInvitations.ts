import { useCallback, useEffect, useRef, useState } from 'react';

import {
  acceptInvitation,
  classifyMembersError,
  declineInvitation,
  fetchMyInvitations,
  type MembersFailure,
} from '../../api/members.api';
import type { ProjectInvitation } from '../../api/members.types';

/**
 * The invitations waiting for THIS account, read from the one project-membership source the
 * Project Members screen writes. My projects keeps no invitation state of its own.
 */
export const useMyInvitations = (onAnswered: () => void) => {
  const [invitations, setInvitations] = useState<readonly ProjectInvitation[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<MembersFailure | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const load = useCallback(async (): Promise<void> => {
    try {
      const next = await fetchMyInvitations();
      if (!mounted.current) return;
      setInvitations(next);
      setFailure(null);
    } catch (error) {
      if (!mounted.current) return;
      setFailure(classifyMembersError(error));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const answer = useCallback(
    async (id: string, action: () => Promise<void>): Promise<void> => {
      if (busyId !== null) return;
      setBusyId(id);
      try {
        await action();
        if (mounted.current) setFailure(null);
      } catch (error) {
        if (mounted.current) setFailure(classifyMembersError(error));
      } finally {
        if (mounted.current) setBusyId(null);
      }
      await load();
      // Accepting adds a project to the list, so the list behind this panel is re-read too.
      onAnswered();
    },
    [busyId, load, onAnswered],
  );

  return {
    invitations,
    busyId,
    failure,
    reload: load,
    accept: (id: string) => answer(id, () => acceptInvitation(id)),
    decline: (id: string) => answer(id, () => declineInvitation(id)),
  };
};
