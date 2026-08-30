import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { FormAlert } from '../../components/FormAlert';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { adoptCurrentCalendar } from '../../api/projects.api';
import { initialsOf } from '../profile/profileModel';
import { ProjectCalendarPanel } from '../projects/components/ProjectCalendarPanel';
import { CalendarVersionPanel } from './components/CalendarVersionPanel';
import { ProjectPermissionsPanel } from './components/ProjectPermissionsPanel';
import { useProjectDashboard } from './useProjectDashboard';
import profileCss from '../profile/profile.css?inline';
import projectsCss from '../projects/projects.css?inline';
import permissionsCss from '../permissions/permissions.css?inline';
import membersCss from '../members/members.css?inline';
import projectDashboardCss from './project-dashboard.css?inline';

const displayDate = (iso: string, lang: 'he' | 'en'): string => {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(
    lang === 'he' ? 'he-IL' : 'en-GB',
    { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' },
  );
};

/**
 * The working context of ONE project.
 *
 * It shows the project the Projects feature owns, the people the Members feature owns and the
 * grants the Permissions feature owns. It stores none of them, and every control it offers comes
 * from what the server said this viewer may do.
 */
export const ProjectDashboardPage = () => {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { data, loading, failure, reload } = useProjectDashboard(projectId);
  const [busy, setBusy] = useState(false);

  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'projects.css', css: projectsCss },
    { id: 'permissions.css', css: permissionsCss },
    { id: 'members.css', css: membersCss },
    { id: 'project-dashboard.css', css: projectDashboardCss },
  );
  useDocumentTitle('לוח הפרויקט / Project dashboard — FieldSync');

  const firstName = user?.firstName ?? '';
  const lastName = user?.lastName ?? '';
  const copy = t.projectDashboard;

  const adopt = async (keepOverrides: boolean): Promise<void> => {
    if (busy) return;
    setBusy(true);
    try {
      await adoptCurrentCalendar(projectId, keepOverrides);
    } finally {
      setBusy(false);
    }
    await reload();
  };

  const project = data?.project;
  const viewer = data?.viewer;
  const place = project?.location.place?.displayName ?? project?.location.city ?? null;
  const anyAction =
    viewer !== undefined &&
    (viewer.canEdit || viewer.canManageMembers || viewer.canInvite || viewer.canGrantPermissions);

  return (
    <div className="app">
      <AppNav name={`${firstName} ${lastName}`.trim()} initials={initialsOf(firstName, lastName)} />

      <main className="profile">
        <header className="profile__head">
          <div className="profile__head-text">
            <h1 className="profile__title" dir="auto">{project?.name ?? copy.title}</h1>
            <p className="profile__sub">{copy.lede}</p>
          </div>
          <div className="profile__head-actions">
            <Link to="/projects" className="btn btn--ghost btn--sm">{copy.backToProjects}</Link>
          </div>
        </header>

        {failure !== null ? (
          <section className="panel">
            <FormAlert message={failure === 'NETWORK' ? copy.network : copy.notFound} />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void reload()}>
              {copy.retry}
            </button>
          </section>
        ) : null}

        {loading ? (
          <section className="panel">
            <p className="panel__lede" role="status">{copy.loading}</p>
          </section>
        ) : null}

        {!loading && data !== null && project !== undefined && viewer !== undefined ? (
          <>
            <section className="panel" aria-labelledby="summary-title">
              <h2 id="summary-title" className="panel__title">{copy.summary.title}</h2>
              <dl className="dash-facts">
                <dt>{copy.summary.type}</dt>
                <dd dir="auto">
                  {project.projectType === 'other' && project.projectTypeOther
                    ? project.projectTypeOther
                    : t.projects.type[project.projectType]}
                </dd>

                <dt>{copy.summary.size}</dt>
                <dd dir="auto">{project.size}</dd>

                <dt>{copy.summary.location}</dt>
                <dd dir="auto">{place ?? copy.summary.noLocation}</dd>

                <dt>{copy.summary.status}</dt>
                <dd>
                  <span className={`project-chip project-chip--${project.status}`}>
                    {t.projects.status[project.status]}
                  </span>
                </dd>

                <dt>{copy.summary.start}</dt>
                <dd>{displayDate(project.dates.startDate, lang)}</dd>

                <dt>{copy.summary.target}</dt>
                <dd>{displayDate(project.dates.targetEndDate, lang)}</dd>

                <dt>{copy.summary.original}</dt>
                <dd>{displayDate(project.dates.originalTargetEndDate, lang)}</dd>

                <dt>{copy.summary.ceiling}</dt>
                <dd>{displayDate(project.dates.overrunCeilingDate, lang)}</dd>

                <dt>{copy.summary.overrun}</dt>
                <dd>
                  {project.dates.overrunDaysFromOriginal === 0
                    ? copy.summary.noOverrun
                    : copy.summary.overrunDays.replace(
                        '{days}',
                        String(project.dates.overrunDaysFromOriginal),
                      )}
                </dd>
              </dl>
            </section>

            {/* Only actions the API would accept from this viewer. Nothing is greyed out. */}
            <section className="panel" aria-labelledby="actions-title">
              <h2 id="actions-title" className="panel__title">{copy.actions.title}</h2>
              <p className="panel__lede">{copy.actions.lede}</p>
              {anyAction ? (
                <div className="dash-actions">
                  {viewer.canEdit ? (
                    <Link to={`/projects/${projectId}/edit`} className="btn btn--primary btn--sm">
                      {copy.actions.edit}
                    </Link>
                  ) : null}
                  {viewer.canManageMembers || viewer.canInvite ? (
                    <Link to={`/projects/${projectId}/members`} className="btn btn--ghost btn--sm">
                      {copy.actions.members}
                    </Link>
                  ) : null}
                  {viewer.canGrantPermissions ? (
                    <Link to="/permissions" className="btn btn--ghost btn--sm">
                      {copy.actions.permissions}
                    </Link>
                  ) : null}
                </div>
              ) : (
                <p className="panel__lede">{copy.actions.none}</p>
              )}
            </section>

            <section className="panel" aria-labelledby="members-count-title">
              <div className="panel__head">
                <h2 id="members-count-title" className="panel__title">{copy.membersPanel.title}</h2>
                <Link to={`/projects/${projectId}/members`} className="btn btn--ghost btn--sm">
                  {copy.membersPanel.open}
                </Link>
              </div>
              <p className="dash-note">
                {copy.membersPanel.active.replace('{count}', String(data.members.active))}
              </p>
              <p className="dash-note">
                {copy.membersPanel.pending.replace('{count}', String(data.members.pending))}
              </p>
            </section>

            {viewer.canGrantPermissions ? <ProjectPermissionsPanel projectId={projectId} /> : null}

            <ProjectCalendarPanel
              project={project}
              outdated={data.calendar.outdated}
              busy={busy}
              canManage={viewer.canManageCalendar}
              onAdopt={(keepOverrides) => void adopt(keepOverrides)}
            />

            <CalendarVersionPanel calendar={data.calendar} />

            {/* Tasks are unbuilt. The section says so rather than rendering zeros. */}
            <section className="panel" aria-labelledby="tasks-title">
              <h2 id="tasks-title" className="panel__title">{copy.tasks.title}</h2>
              {data.tasks === null ? (
                <p className="panel__lede">{copy.tasks.unavailable}</p>
              ) : (
                <p className="dash-note">{String(data.tasks.total)}</p>
              )}
            </section>
          </>
        ) : null}
      </main>
    </div>
  );
};
