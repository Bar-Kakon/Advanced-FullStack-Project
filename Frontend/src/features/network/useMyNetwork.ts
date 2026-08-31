import { useCallback, useEffect, useRef, useState } from 'react';

import {
  acceptConnection,
  classifyNetworkError,
  declineConnection,
  fetchMyBlocks,
  fetchNetworkGroup,
  removeConnection,
  unblockUser,
  withdrawConnection,
  type NetworkFailure,
} from '../../api/network.api';
import type { BlockedRow, NetworkRow, NetworkTab } from '../../api/network.types';

const PAGE_SIZE = 20;

export type NetworkAction = 'accept' | 'decline' | 'withdraw' | 'remove' | 'unblock';

const PERFORM: Record<NetworkAction, (userId: string) => Promise<void>> = {
  accept: acceptConnection,
  decline: declineConnection,
  withdraw: withdrawConnection,
  remove: removeConnection,
  unblock: unblockUser,
};

export interface Row {
  readonly person: NetworkRow['person'];
  readonly at: string;
}

const toRows = (rows: readonly (NetworkRow | BlockedRow)[]): Row[] =>
  rows.map((row) => ({
    person: row.person,
    at: 'since' in row ? row.since : row.blockedAt,
  }));

export const useMyNetwork = (tab: NetworkTab) => {
  const [rows, setRows] = useState<readonly Row[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [failure, setFailure] = useState<NetworkFailure | null>(null);
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // A superseded tab's answer must not overwrite the tab now on screen.
  const request = useRef(0);

  const read = useCallback(
    async (next: string | null, signal?: AbortSignal) =>
      tab === 'blocked'
        ? fetchMyBlocks(next, PAGE_SIZE, signal)
        : fetchNetworkGroup(tab, next, PAGE_SIZE, signal),
    [tab],
  );

  const load = useCallback(async (): Promise<void> => {
    const ticket = (request.current += 1);
    setLoading(true);
    try {
      const page = await read(null);
      if (!mounted.current || ticket !== request.current) return;
      setRows(toRows(page.rows));
      setCursor(page.nextCursor);
      setFailure(null);
    } catch (error) {
      if (!mounted.current || ticket !== request.current) return;
      setFailure(classifyNetworkError(error));
    } finally {
      if (mounted.current && ticket === request.current) setLoading(false);
    }
  }, [read]);

  useEffect(() => {
    void load();
  }, [load]);

  const loadMore = useCallback(async (): Promise<void> => {
    if (cursor === null || loadingMore) return;
    const ticket = request.current;
    setLoadingMore(true);
    try {
      const page = await read(cursor);
      if (!mounted.current || ticket !== request.current) return;
      setRows((current) => [...(current ?? []), ...toRows(page.rows)]);
      setCursor(page.nextCursor);
    } catch (error) {
      if (!mounted.current || ticket !== request.current) return;
      setFailure(classifyNetworkError(error));
    } finally {
      if (mounted.current) setLoadingMore(false);
    }
  }, [cursor, loadingMore, read]);

  /** Nothing is guessed locally: every action re-reads the group and renders what the server says. */
  const act = useCallback(
    async (action: NetworkAction, userId: string): Promise<void> => {
      if (pendingUserId !== null) return;
      setPendingUserId(userId);
      try {
        await PERFORM[action](userId);
        setFailure(null);
      } catch (error) {
        if (mounted.current) setFailure(classifyNetworkError(error));
      } finally {
        if (mounted.current) setPendingUserId(null);
      }
      await load();
    },
    [load, pendingUserId],
  );

  return { rows, loading, loadingMore, failure, pendingUserId, hasMore: cursor !== null, reload: load, loadMore, act };
};
