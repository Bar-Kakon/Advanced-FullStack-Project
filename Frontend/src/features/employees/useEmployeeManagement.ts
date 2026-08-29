import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  approveAllPendingEmployees,
  approveEmployee,
  cancelInvitation,
  classifyEmployeeError,
  inviteEmployee,
  listEmployees,
  type EmployeeFailure,
} from '../../api/employees.api';
import type { CompanyPosition, EmployeeMembership } from '../../api/types';

export interface InviteInput {
  readonly fullName: string;
  readonly companyPosition: CompanyPosition;
}

/**
 * One hook for both places the feature is mounted. Nothing here writes a membership status of its
 * own: every action re-reads the list and renders what the server says.
 */
export const useEmployeeManagement = () => {
  const [rows, setRows] = useState<readonly EmployeeMembership[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [listFailure, setListFailure] = useState<EmployeeFailure | null>(null);

  const [inviting, setInviting] = useState(false);
  const [inviteFailure, setInviteFailure] = useState<EmployeeFailure | null>(null);
  const [invited, setInvited] = useState(false);

  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [actionFailure, setActionFailure] = useState<EmployeeFailure | null>(null);

  // A request can outlive the screen that started it; this keeps its result out of a dead render.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /** `quiet` keeps the rows on screen while a refresh runs, so the table does not blank. */
  const load = useCallback(async (quiet = false): Promise<void> => {
    if (!quiet) setLoading(true);
    try {
      const memberships = await listEmployees();
      if (!mounted.current) return;
      setRows(memberships);
      setListFailure(null);
    } catch (error) {
      if (!mounted.current) return;
      setListFailure(classifyEmployeeError(error));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** The 201 is ignored on purpose: the list is re-read, so the row shown is the server's. */
  const invite = useCallback(
    async (input: InviteInput): Promise<boolean> => {
      if (inviting) return false;
      setInviting(true);
      setInviteFailure(null);
      setInvited(false);
      try {
        await inviteEmployee({ fullName: input.fullName.trim(), companyPosition: input.companyPosition });
        await load(true);
        if (mounted.current) setInvited(true);
        return true;
      } catch (error) {
        if (mounted.current) setInviteFailure(classifyEmployeeError(error));
        return false;
      } finally {
        if (mounted.current) setInviting(false);
      }
    },
    [inviting, load],
  );

  /** One waiting relationship. The row's own button is the only thing that may be pressed twice. */
  const approve = useCallback(
    async (membershipId: string): Promise<void> => {
      if (approvingId !== null || approvingAll) return;
      setApprovingId(membershipId);
      setActionFailure(null);
      try {
        await approveEmployee(membershipId);
        await load(true);
      } catch (error) {
        if (!mounted.current) return;
        setActionFailure(classifyEmployeeError(error));
        // Re-read even on failure: a stale row is the likeliest cause.
        await load(true);
      } finally {
        if (mounted.current) setApprovingId(null);
      }
    },
    [approvingId, approvingAll, load],
  );

  const cancel = useCallback(
    async (membershipId: string): Promise<void> => {
      if (cancellingId !== null) return;
      setCancellingId(membershipId);
      setActionFailure(null);
      try {
        await cancelInvitation(membershipId);
      } catch (error) {
        if (mounted.current) setActionFailure(classifyEmployeeError(error));
      } finally {
        // The row leaves only because the server's own list no longer carries it.
        await load(true);
        if (mounted.current) setCancellingId(null);
      }
    },
    [cancellingId, load],
  );

  /** One request, because the server answers one. Looping `approve` would split it into many. */
  const approveAll = useCallback(async (): Promise<void> => {
    if (approvingAll || approvingId !== null) return;
    setApprovingAll(true);
    setActionFailure(null);
    try {
      await approveAllPendingEmployees();
      await load(true);
    } catch (error) {
      if (mounted.current) setActionFailure(classifyEmployeeError(error));
    } finally {
      if (mounted.current) setApprovingAll(false);
    }
  }, [approvingAll, approvingId, load]);

  /**
   * The owner's own row is filtered out on `standing`: Register writes it with no name and no
   * position, so it cannot be drawn. It is a display filter, never an authorization test.
   */
  const employees = useMemo(
    () => (rows ?? []).filter(
      (row) => row.standing === 'employee'
        // A withdrawn seat nobody ever claimed is not a member, so it leaves the list.
        && !(row.status === 'inactive' && row.userId === null),
    ),
    [rows],
  );

  /**
   * The Main Contractor job is the owner's, and a company has one. A seat already open for it
   * counts too, so the option disappears rather than being offered and refused.
   */
  const mainContractorTaken = useMemo(
    () => (rows ?? []).some(
      (row) => row.standing === 'owner'
        || (row.companyPosition === 'main_contractor' && row.status !== 'inactive'),
    ),
    [rows],
  );

  const pendingCount = useMemo(
    () => employees.filter((row) => row.status === 'pending_company_approval').length,
    [employees],
  );

  return {
    employees,
    pendingCount,
    loaded: rows !== null,
    loading,
    listFailure,
    inviting,
    inviteFailure,
    invited,
    approvingId,
    cancellingId,
    approvingAll,
    mainContractorTaken,
    actionFailure,
    invite,
    approve,
    approveAll,
    cancel,
    refresh: useCallback(() => void load(true), [load]),
  };
};

export type EmployeeManagementState = ReturnType<typeof useEmployeeManagement>;
