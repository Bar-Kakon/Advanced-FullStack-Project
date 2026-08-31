import { useCallback, useEffect, useRef, useState } from 'react';

import {
  classifyBrowseError,
  isAbortError,
  searchContractors,
  type BrowseFailure,
} from '../../api/browse.api';
import type { BrowseFilters, ContractorSummary } from '../../api/browse.types';
import { emptyBrowseFilters } from '../../api/browse.types';

const PAGE_SIZE = 12;

export const useBrowse = () => {
  const [filters, setFilters] = useState<BrowseFilters>(emptyBrowseFilters);
  const [contractors, setContractors] = useState<readonly ContractorSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failure, setFailure] = useState<BrowseFailure | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [loaded, setLoaded] = useState(false);

  /*
   * Two guards, because a slow first response must never replace a newer one: the controller
   * aborts the superseded request, and the sequence number ignores anything that still lands.
   */
  const inFlight = useRef<AbortController | null>(null);
  const sequence = useRef(0);

  const run = useCallback(async (next: BrowseFilters, append: string | null): Promise<void> => {
    inFlight.current?.abort();
    const controller = new AbortController();
    inFlight.current = controller;
    const ticket = ++sequence.current;

    if (append) setLoadingMore(true);
    else setLoading(true);
    setFailure(null);

    try {
      const page = await searchContractors(next, append, PAGE_SIZE, controller.signal);
      if (ticket !== sequence.current) return;

      setContractors((current) => (append ? [...current, ...page.contractors] : page.contractors));
      setCursor(page.nextCursor);
      setDegraded(page.distanceFilterDegraded);
      setLoaded(true);
    } catch (error) {
      if (isAbortError(error) || ticket !== sequence.current) return;
      setFailure(classifyBrowseError(error));
    } finally {
      if (ticket === sequence.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    void run(filters, null);
  }, [filters, run]);

  useEffect(() => () => inFlight.current?.abort(), []);

  const applyFilters = useCallback((patch: Partial<BrowseFilters>): void => {
    setFilters((current) => ({ ...current, ...patch }));
  }, []);

  const loadMore = useCallback((): void => {
    if (!cursor || loadingMore || loading) return;
    void run(filters, cursor);
  }, [cursor, loadingMore, loading, filters, run]);

  return {
    filters,
    applyFilters,
    clearFilters: useCallback(() => setFilters(emptyBrowseFilters), []),
    contractors,
    hasMore: cursor !== null,
    loading,
    loadingMore,
    loaded,
    failure,
    degraded,
    loadMore,
    retry: useCallback(() => void run(filters, null), [filters, run]),
  };
};

export type BrowseState = ReturnType<typeof useBrowse>;