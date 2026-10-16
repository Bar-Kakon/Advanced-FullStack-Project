import { Link } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { FormAlert } from '../../components/FormAlert';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import { PendingInvitations } from './components/PendingInvitations';
import { ProjectCard } from './components/ProjectCard';
import { useMyInvitations } from './useMyInvitations';
import { useProjects } from './useProjects';
import profileCss from '../profile/profile.css?inline';
import projectsCss from './projects.css?inline';

export const MyProjectsPage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { projects, loading, loadingMore, failure, hasMore, reload, loadMore } = useProjects();
  const invitations = useMyInvitations(reload);

  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'projects.css', css: projectsCss },
  );
  useDocumentTitle('הפרויקטים שלי / My projects — Blokta');

  const firstName = user?.firstName ?? '';
  const lastName = user?.lastName ?? '';

  const message =
    failure === 'NETWORK'
      ? t.projects.errors.network
      : failure === 'NO_COMPANY'
        ? t.projects.errors.noCompany
        : t.projects.errors.unknown;

  return (
    <div className="app">
      <AppNav name={`${firstName} ${lastName}`.trim()} initials={initialsOf(firstName, lastName)} />

      <main className="profile">
        <header className="profile__head">
          <div className="profile__head-text">
            <h1 className="profile__title">{t.projects.title}</h1>
            <p className="profile__sub">{t.projects.lede}</p>
          </div>
          <div className="profile__head-actions">
            {/* The entry point into the central surface. It manages project-scoped grants across
                every project this account administers — the same rows a Project Dashboard edits. */}
            <Link to="/permissions" className="btn btn--ghost btn--sm">{t.permissions.entry}</Link>
            <Link to="/projects/new" className="btn btn--primary btn--sm">{t.projects.create}</Link>
          </div>
        </header>

        {/* The same membership rows the Project Members screen writes — never a second source. */}
        <PendingInvitations
          invitations={invitations.invitations}
          busyId={invitations.busyId}
          failure={invitations.failure}
          onAccept={(id) => void invitations.accept(id)}
          onDecline={(id) => void invitations.decline(id)}
        />

        <section className="panel" aria-live="polite">
          {failure !== null ? (
            <>
              <FormAlert message={message} />
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => void reload()}>
                {t.projects.retry}
              </button>
            </>
          ) : null}

          {loading ? <p className="panel__lede" role="status">{t.projects.loading}</p> : null}

          {!loading && projects !== null && projects.length === 0 && failure === null ? (
            <p className="panel__lede">{t.projects.empty}</p>
          ) : null}

          {/* Grouped by the real current management relationship, never by who created it. */}
          {!loading && projects !== null && projects.length > 0 ? (
            <>
              {([
                ['mine', projects.filter((p) => p.viewerManages)],
                ['notManaged', projects.filter((p) => !p.viewerManages)],
              ] as const).map(([group, rows]) =>
                rows.length === 0 ? null : (
                  <section key={group} className="project-group">
                    {/* One heading is noise when every project sits under it. */}
                    {projects.some((p) => p.viewerManages) &&
                    projects.some((p) => !p.viewerManages) ? (
                      <h2 className="project-group__title">{t.projects.groups[group]}</h2>
                    ) : null}
                    <ul className="project-list">
                      {rows.map((project) => (
                        <ProjectCard key={project.id} project={project} />
                      ))}
                    </ul>
                  </section>
                ),
              )}
            </>
          ) : null}

          {hasMore ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {t.projects.loadMore}
            </button>
          ) : null}
        </section>
      </main>
    </div>
  );
};
