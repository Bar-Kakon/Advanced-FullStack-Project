import { useCallback, useEffect, useRef, useState } from 'react';

import {
  classifyPermissionsError,
  createTemplate,
  deleteTemplate,
  fetchPermissionsOverview,
  revokeGrant,
  updateGrant,
  type PermissionsFailure,
} from '../../api/permissions.api';
import type { PermissionsOverview, ProjectPermission } from '../../api/permissions.types';

export const usePermissions = () => {
  const [overview, setOverview] = useState<PermissionsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [failure, setFailure] = useState<PermissionsFailure | null>(null);

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
      const next = await fetchPermissionsOverview();
      if (!mounted.current) return;
      setOverview(next);
      setFailure(null);
    } catch (error) {
      if (!mounted.current) return;
      setFailure(classifyPermissionsError(error));
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /** Every mutation re-reads the server rather than patching state locally. */
  const run = useCallback(
    async (id: string, action: () => Promise<unknown>): Promise<void> => {
      if (busyId !== null) return;
      setBusyId(id);
      try {
        await action();
        setFailure(null);
      } catch (error) {
        if (mounted.current) setFailure(classifyPermissionsError(error));
      } finally {
        if (mounted.current) setBusyId(null);
      }
      await load();
    },
    [busyId, load],
  );

  return {
    overview,
    loading,
    busyId,
    failure,
    reload: load,
    setFullAuthority: (grantId: string, fullAuthority: boolean) =>
      run(grantId, () => updateGrant(grantId, { fullAuthority })),
    setPermissions: (grantId: string, permissions: readonly ProjectPermission[]) =>
      run(grantId, () => updateGrant(grantId, { permissions })),
    revoke: (grantId: string) => run(grantId, () => revokeGrant(grantId)),
    addTemplate: (name: string, permissions: readonly ProjectPermission[], fullAuthority: boolean) =>
      run('new-template', () => createTemplate(name, permissions, fullAuthority)),
    removeTemplate: (templateId: string) => run(templateId, () => deleteTemplate(templateId)),
  };
};
