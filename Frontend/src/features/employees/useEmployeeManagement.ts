import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  approveAllPendingEmployees,
  approveEmployee,
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
 * The whole state of the employee-management feature, in one hook, so that both places the screen
 * is used are the same behaviour rather than two implementations that will drift.
 *
 * Nothing here writes a membership status of its own. Every action that changes one re-reads the
 * list afterwards and renders what the server says, because the server is the only thing that
 * knows what actually moved — a bulk approval may have caught rows this client had not seen yet,
 * and a single approval may have raced with one.
 */
export const useEmployeeManagement = () => {
  const [rows, setRows] = useState<readonly EmployeeMembership[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [listFailure, setListFailure] = useState<EmployeeFailure | null>(null);

  const [inviting, setInviting] = useState(false);
  const [inviteFailure, setInviteFailure] = useState<EmployeeFailure | null>(null);
  const [invited, setInvited] = useState(false);

  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvingAll, setApprovingAll] = useState(false);
  const [actionFailure, setActionFailure] = useState<EmployeeFailure | null>(null);

  /*
   * The list request is fired by an effect and again by every action, so a screen left open while
   * an approval resolves can outlive its own mount. Writing state into an unmounted component is
   * the warning this ref exists to prevent, and it is a ref rather than state because changing it
   * must not itself cause a render.
   */
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  /**
   * Reads the canonical list. `quiet` keeps the rows already on screen while a refresh runs, so
   * approving somebody does not blank the table underneath the button that was just pressed.
   */
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

  /**
   * Opens a seat. The 201 names the new row and this deliberately ignores it: the list is re-read
   * instead, so what appears on screen is a row the server holds rather than one assembled here.
   */
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
        // A stale row is the likeliest cause, so the list is re-read even though the call failed:
        // leaving an Approve button on somebody who is already active would invite the same failure.
        await load(true);
      } finally {
        if (mounted.current) setApprovingId(null);
      }
    },
    [approvingId, approvingAll, load],
  );

  /**
   * Every waiting relationship, in the one request the server answers. Looping `approve` from here
   * would be the same work split into failures that can each land differently.
   */
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
   * The rows this screen is about. The owner's own membership is filtered out on `standing`, which
   * the server puts on every row for exactly this distinction — it is not an authorization test,
   * and nothing here reads `standing` to decide what anybody may do. Register writes that row with
   * no name and no position, so it is not a row that could be drawn.
   */
  const employees = useMemo(
    () => (rows ?? []).filter((row) => row.standing === 'employee'),
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
    approvingAll,
    actionFailure,
    invite,
    approve,
    approveAll,
    refresh: useCallback(() => void load(true), [load]),
  };
};

export type EmployeeManagementState = ReturnType<typeof useEmployeeManagement>;
