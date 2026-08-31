import { useState } from 'react';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import { FullAuthorityDialog } from './FullAuthorityDialog';
import type { Grant, ProjectPermission } from '../../../api/permissions.types';

export interface GrantRowProps {
  readonly grant: Grant;
  /** The signed-in account, so their own row can suppress the two controls the server refuses. */
  readonly viewerUserId: string | undefined;
  readonly allPermissions: readonly ProjectPermission[];
  readonly busyId: string | null;
  readonly onSetPermissions: (grantId: string, permissions: readonly ProjectPermission[]) => void;
  readonly onSetFullAuthority: (grantId: string, fullAuthority: boolean) => void;
  readonly onRevoke: (grantId: string) => void;
}

/**
 * One project grant, wherever it is shown. The central screen and the per-project surface inside a
 * Project Dashboard both render this — one row implementation over one grants model, so the two
 * views cannot drift into two different sets of rules.
 */
export const GrantRow = ({
  grant, viewerUserId, allPermissions, busyId, onSetPermissions, onSetFullAuthority, onRevoke,
}: GrantRowProps) => {
  const { t } = useLanguage();
  const [confirming, setConfirming] = useState(false);

  const isViewer = grant.userId === viewerUserId;
  // A refused or withdrawn grant is history. Editing it would suggest an authority nobody holds.
  const inactive = grant.status === 'removed' || grant.status === 'declined';

  const togglePermission = (permission: ProjectPermission) =>
    onSetPermissions(
      grant.id,
      grant.permissions.includes(permission)
        ? grant.permissions.filter((p) => p !== permission)
        : [...grant.permissions, permission],
    );

  return (
    <li className="perm-grant">
      <div className="perm-grant__head">
        <span className="perm-grant__role">{t.permissions.roles[grant.projectRole]}</span>
        {isViewer ? <span className="perm-chip">{t.permissions.grants.you}</span> : null}
        {grant.status === 'removed' ? (
          <span className="perm-chip perm-chip--off">{t.permissions.grants.revoked}</span>
        ) : null}
        {grant.status === 'declined' ? (
          <span className="perm-chip perm-chip--off">{t.permissions.grants.declined}</span>
        ) : null}
        {grant.status === 'invited' ? (
          <span className="perm-chip perm-chip--off">{t.permissions.grants.invited}</span>
        ) : null}
        {grant.fullAuthority ? (
          <span className="perm-chip perm-chip--full">{t.permissions.fullAuthority.granted}</span>
        ) : null}
      </div>

      {/* Individual permissions are hidden under full authority: it already covers them, and a
          half-ticked list would misdescribe what is granted. */}
      {grant.fullAuthority ? null : (
        <ul className="perm-checks">
          {allPermissions.map((permission) => (
            <li key={permission}>
              <label className="perm-check">
                <input
                  type="checkbox"
                  value={permission}
                  checked={grant.permissions.includes(permission)}
                  disabled={busyId !== null || inactive}
                  onChange={() => togglePermission(permission)}
                />
                <span>{t.permissions.perms[permission]}</span>
              </label>
            </li>
          ))}
        </ul>
      )}

      {/* Your own row offers neither action: the server refuses both, and a control that always
          fails is worse than no control. */}
      {inactive || isViewer ? null : (
        <div className="perm-grant__actions">
          {grant.fullAuthority ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busyId !== null}
              onClick={() => onSetFullAuthority(grant.id, false)}
            >
              {t.permissions.fullAuthority.reduce}
              {busyId === grant.id ? <ButtonSpinner /> : null}
            </button>
          ) : (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={busyId !== null}
              onClick={() => setConfirming(true)}
            >
              {t.permissions.fullAuthority.label}
            </button>
          )}

          <button
            type="button"
            className="btn btn--quiet btn--sm"
            disabled={busyId !== null}
            onClick={() => onRevoke(grant.id)}
          >
            {t.permissions.grants.revoke}
          </button>
        </div>
      )}

      {confirming ? (
        <FullAuthorityDialog
          busy={busyId === grant.id}
          onConfirm={() => {
            setConfirming(false);
            onSetFullAuthority(grant.id, true);
          }}
          onDismiss={() => setConfirming(false)}
        />
      ) : null}
    </li>
  );
};
