import { Link } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { FormAlert } from '../../components/FormAlert';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import { ProjectCard } from './components/ProjectCard';
import { useProjects } from './useProjects';
import profileCss from '../profile/profile.css?inline';
import projectsCss from './projects.css?inline';

export const MyProjectsPage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const { projects, loading, loadingMore, failure, hasMore, reload, loadMore } = useProjects();

  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'projects.css', css: projectsCss },
  );
  useDocumentTitle('הפרויקטים שלי / My projects — FieldSync');

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
          <Link to="/projects/new" className="btn btn--primary btn--sm">{t.projects.create}</Link>
        </header>

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

          {!loading && projects !== null && projects.length > 0 ? (
            <ul className="project-list">
              {projects.map((project) => (
                <ProjectCard key={project.id} project={project} />
              ))}
            </ul>
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
