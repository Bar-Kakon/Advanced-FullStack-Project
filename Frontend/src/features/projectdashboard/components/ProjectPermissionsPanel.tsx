import { Link } from 'react-router-dom';

import { FormAlert } from '../../../components/FormAlert';
import { useAuth } from '../../../auth/useAuth';
import { useLanguage } from '../../../i18n/useLanguage';
import { GrantRow } from '../../permissions/components/GrantRow';
import { usePermissions } from '../../permissions/usePermissions';

/**
 * The per-project half of the hybrid Permissions feature.
 *
 * It is not a second permission system: the same hook, the same endpoints and the same row
 * component as the central screen, with one filter applied. A change made here and a change made
 * there write the identical grant row, and the self-lockout rule is the server's either way.
 */
export const ProjectPermissionsPanel = ({ projectId }: { projectId: string }) => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { overview, loading, busyId, failure, setFullAuthority, setPermissions, revoke } =
    usePermissions();

  const grants = (overview?.grants ?? []).filter((grant) => grant.projectId === projectId);

  return (
    <section className="panel" aria-labelledby="project-permissions-title" aria-live="polite">
      <div className="panel__head">
        <h2 id="project-permissions-title" className="panel__title">
          {t.projectDashboard.permissionsPanel.title}
        </h2>
        <Link to="/permissions" className="btn btn--ghost btn--sm">
          {t.projectDashboard.permissionsPanel.central}
        </Link>
      </div>
      <p className="panel__lede">{t.projectDashboard.permissionsPanel.lede}</p>

      {failure !== null ? <FormAlert message={t.permissions.errors.unknown} /> : null}

      {loading ? (
        <p className="panel__lede" role="status">{t.permissions.loading}</p>
      ) : grants.length === 0 ? (
        <p className="panel__lede">{t.projectDashboard.permissionsPanel.empty}</p>
      ) : (
        <ul className="perm-grants">
          {grants.map((grant) => (
            <GrantRow
              key={grant.id}
              grant={grant}
              viewerUserId={user?.id}
              allPermissions={overview?.allPermissions ?? []}
              busyId={busyId}
              onSetPermissions={(id, next) => void setPermissions(id, next)}
              onSetFullAuthority={(id, next) => void setFullAuthority(id, next)}
              onRevoke={(id) => void revoke(id)}
            />
          ))}
        </ul>
      )}
    </section>
  );
};
