import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchProposal } from '../../api/coordination.api';
import type { Proposal } from '../../api/coordination.types';

export const useProposal = (proposalId: string) => {
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [actionFailed, setActionFailed] = useState(false);

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
      const next = await fetchProposal(proposalId);
      if (!mounted.current) return;
      setProposal(next);
      setFailed(false);
    } catch {
      if (mounted.current) setFailed(true);
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, [proposalId]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = useCallback(async (work: () => Promise<Proposal>): Promise<void> => {
    setBusy(true);
    setActionFailed(false);
    try {
      const next = await work();
      if (mounted.current) setProposal(next);
    } catch {
      if (mounted.current) setActionFailed(true);
    } finally {
      if (mounted.current) setBusy(false);
    }
  }, []);

  const replace = useCallback((next: Proposal): void => {
    setProposal(next);
  }, []);

  return { proposal, loading, busy, failed, actionFailed, act, replace, reload: load };
};
