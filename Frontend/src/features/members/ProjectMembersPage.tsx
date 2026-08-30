import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { FormAlert } from '../../components/FormAlert';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import { InviteMemberForm } from './components/InviteMemberForm';
import { MemberRow } from './components/MemberRow';
import { useProjectMembers } from './useProjectMembers';
import { fetchPermissionsOverview } from '../../api/permissions.api';
import type { PermissionTemplate } from '../../api/permissions.types';
import profileCss from '../profile/profile.css?inline';
import projectsCss from '../projects/projects.css?inline';
import permissionsCss from '../permissions/permissions.css?inline';
import membersCss from './members.css?inline';

/**
 * The people on ONE project. Membership and authority are two different things here: a row says a
 * person takes part, and the grant fields beside it say what they may do. Nothing is inferred from
 * the project role, the company or the job title.
 */
export const ProjectMembersPage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { data, loading, busyId, failure, reload, invite, changeRole, remove } =
    useProjectMembers(projectId);

  const [templates, setTemplates] = useState<readonly PermissionTemplate[]>([]);

  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'projects.css', css: projectsCss },
    { id: 'permissions.css', css: permissionsCss },
    { id: 'members.css', css: membersCss },
  );
  useDocumentTitle('משתתפים בפרויקט / Project members — FieldSync');

  // Templates are company-owned and live on the Permissions surface; this screen only applies them.
  useEffect(() => {
    if (data?.viewer.canGrantPermissions !== true) return;
    const controller = new AbortController();
    fetchPermissionsOverview(controller.signal)
      .then((overview) => setTemplates(overview.templates))
      .catch(() => setTemplates([]));
    return () => controller.abort();
  }, [data?.viewer.canGrantPermissions]);

  const firstName = user?.firstName ?? '';
  const lastName = user?.lastName ?? '';

  const message =
    failure === 'NETWORK' ? t.members.errors.network
      : failure === 'NOT_FOUND' ? t.members.errors.notFound
        : failure === 'NOT_PERMITTED' ? t.members.errors.notPermitted
          : failure === 'ALREADY_ON_PROJECT' ? t.members.errors.alreadyOnProject
            : failure === 'BLOCKED' ? t.members.errors.blocked
              : failure === 'INVITATION_CLOSED' ? t.members.errors.invitationClosed
                : failure === 'OWN_AUTHORITY' ? t.members.errors.ownAuthority
                  : t.members.errors.unknown;

  const busy = busyId !== null;

  return (
    <div className="app">
      <AppNav name={`${firstName} ${lastName}`.trim()} initials={initialsOf(firstName, lastName)} />

      <main className="profile">
        <header className="profile__head">
          <div className="profile__head-text">
            <h1 className="profile__title">{t.members.title}</h1>
            <p className="profile__sub" dir="auto">{data?.projectName ?? t.members.lede}</p>
          </div>
          <div className="profile__head-actions">
            <Link to="/projects" className="btn btn--ghost btn--sm">{t.members.backToProjects}</Link>
            {data?.viewer.canGrantPermissions ? (
              <Link to="/permissions" className="btn btn--ghost btn--sm">{t.members.authority.manage}</Link>
            ) : null}
          </div>
        </header>

        {failure !== null ? (
          <section className="panel">
            <FormAlert message={message} />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void reload()}>
              {t.members.retry}
            </button>
          </section>
        ) : null}

        {loading ? (
          <section className="panel">
            <p className="panel__lede" role="status">{t.members.loading}</p>
          </section>
        ) : null}

        {!loading && data !== null ? (
          <>
            <section className="panel" aria-labelledby="members-title" aria-live="polite">
              <h2 id="members-title" className="panel__title">{t.members.active.title}</h2>
              {data.members.length === 0 ? (
                <p className="panel__lede">{t.members.active.none}</p>
              ) : (
                <ul className="member-list">
                  {data.members.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      viewer={data.viewer}
                      allRoles={data.allRoles}
                      busy={busy}
                      busyId={busyId}
                      onChangeRole={(id, role) => void changeRole(id, role)}
                      onRemove={(id) => void remove(id)}
                    />
                  ))}
                </ul>
              )}
            </section>

            <section className="panel" aria-labelledby="pending-title" aria-live="polite">
              <h2 id="pending-title" className="panel__title">{t.members.pending.title}</h2>
              {data.invitations.length === 0 ? (
                <p className="panel__lede">{t.members.pending.none}</p>
              ) : (
                <ul className="member-list">
                  {data.invitations.map((member) => (
                    <MemberRow
                      key={member.id}
                      member={member}
                      viewer={data.viewer}
                      allRoles={data.allRoles}
                      busy={busy}
                      busyId={busyId}
                      onChangeRole={(id, role) => void changeRole(id, role)}
                      onRemove={(id) => void remove(id)}
                    />
                  ))}
                </ul>
              )}
            </section>

            {/* No control appears that the API would refuse: the server decides, the screen renders it. */}
            {data.viewer.canInvite ? (
              <InviteMemberForm
                data={data}
                templates={templates}
                busy={busy}
                onInvite={invite}
              />
            ) : null}
          </>
        ) : null}
      </main>
    </div>
  );
};
