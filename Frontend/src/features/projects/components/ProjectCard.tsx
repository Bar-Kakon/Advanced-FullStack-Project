import { Link } from 'react-router-dom';

import { useLanguage } from '../../../i18n/useLanguage';
import type { Project } from '../../../api/projects.types';

const displayDate = (iso: string, lang: 'he' | 'en'): string => {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  // Built from the parts rather than parsed, so no timezone can shift the day.
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(
    lang === 'he' ? 'he-IL' : 'en-GB',
    { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' },
  );
};

export const ProjectCard = ({ project }: { project: Project }) => {
  const { t, lang } = useLanguage();
  const { dates, location } = project;

  const place = location.place?.displayName ?? location.city ?? null;
  const moved = dates.overrunDaysFromOriginal > 0;

  return (
    <li className="project-card">
      <div className="project-card__head">
        <h2 className="project-card__name" dir="auto">{project.name}</h2>
        <span className="project-card__badges">
          <span className="project-chip project-chip--type">
            {project.projectType === 'other' && project.projectTypeOther
              ? project.projectTypeOther
              : t.projects.type[project.projectType]}
          </span>
          <span className={`project-chip project-chip--${project.status}`}>
            {t.projects.status[project.status]}
          </span>
        </span>
      </div>

      {project.description ? (
        <p className="project-card__desc" dir="auto">{project.description}</p>
      ) : null}

      <p className="project-card__meta">
        <span dir="auto">{place ?? t.projects.card.noLocation}</span>
        <span dir="auto">{project.size}</span>
        <span>
          {t.projects.card.dates
            .replace('{start}', displayDate(dates.startDate, lang))
            .replace('{target}', displayDate(dates.targetEndDate, lang))}
        </span>
      </p>

      {/* The original promise is shown only once the target has actually moved away from it. */}
      {moved ? (
        <p className="project-card__overrun">
          <span>{t.projects.card.originalTarget.replace('{date}', displayDate(dates.originalTargetEndDate, lang))}</span>
          <span>{t.projects.card.overrun.replace('{days}', String(dates.overrunDaysFromOriginal))}</span>
        </p>
      ) : null}

      <div className="project-card__actions">
        <Link to={`/projects/${project.id}`} className="btn btn--primary btn--sm">
          {t.projectDashboard.entry}
        </Link>
        <Link to={`/projects/${project.id}/members`} className="btn btn--ghost btn--sm">
          {t.members.entry}
        </Link>
        {/* Edit appears only where the viewer actually holds management authority. */}
        {project.viewerManages ? (
          <Link to={`/projects/${project.id}/edit`} className="btn btn--ghost btn--sm">
            {t.projects.edit}
          </Link>
        ) : null}
      </div>
    </li>
  );
};
