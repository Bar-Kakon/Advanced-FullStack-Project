import { useCallback, useEffect, useRef, useState } from 'react';

import {
  classifyMembersError,
  fetchProjectMembers,
  inviteMember,
  removeMember,
  setMemberRole,
  type MembersFailure,
} from '../../api/members.api';
import type { InvitePayload, ProjectMembers } from '../../api/members.types';
import type { ProjectRole } from '../../api/permissions.types';

export const useProjectMembers = (projectId: string) => {
  const [data, setData] = useState<ProjectMembers | null>(null);
  const [loading, setLoading] = useState(true);
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
    setLoading(true);
    try {
      const next = await fetchProjectMembers(projectId);
      if (!mounted.current) return;
      setData(next);
      setFailure(null);
    } catch (error) {
      if (!mounted.current) return;
      setFailure(classifyMembersError(error));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Every write re-reads the server. A row leaves because the server dropped it, not because React did. */
  const run = useCallback(
    async (id: string, action: () => Promise<unknown>): Promise<boolean> => {
      if (busyId !== null) return false;
      setBusyId(id);
      let succeeded = true;
      try {
        await action();
        if (mounted.current) setFailure(null);
      } catch (error) {
        succeeded = false;
        if (mounted.current) setFailure(classifyMembersError(error));
      } finally {
        if (mounted.current) setBusyId(null);
      }
      await load();
      return succeeded;
    },
    [busyId, load],
  );

  return {
    data,
    loading,
    busyId,
    failure,
    reload: load,
    invite: (payload: InvitePayload) => run('invite', () => inviteMember(projectId, payload)),
    changeRole: (membershipId: string, projectRole: ProjectRole) =>
      run(membershipId, () => setMemberRole(projectId, membershipId, projectRole)),
    remove: (membershipId: string) => run(membershipId, () => removeMember(projectId, membershipId)),
  };
};
