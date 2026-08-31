import { useState } from 'react';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import type { Project, Weekday } from '../../../api/projects.types';

const asTime = (minutes: number): string =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

export interface ProjectCalendarPanelProps {
  readonly project: Project;
  readonly outdated: boolean;
  readonly busy: boolean;
  readonly canManage: boolean;
  readonly onAdopt: (keepOverrides: boolean) => void;
}

/**
 * What this project actually works by, and — only when a newer company version exists — an
 * explicit way to take it. Nothing here applies a company change on its own.
 */
export const ProjectCalendarPanel = ({
  project,
  outdated,
  busy,
  canManage,
  onAdopt,
}: ProjectCalendarPanelProps) => {
  const { t } = useLanguage();
  const [keepOverrides, setKeepOverrides] = useState(true);

  const effective = project.calendar.effective;
  if (effective === null) return null;

  return (
    <section className="panel" aria-labelledby="project-calendar-title">
      <h2 id="project-calendar-title" className="panel__title">{t.projects.calendar.title}</h2>
      <p className="panel__lede">{t.projects.calendar.pinned}</p>

      <dl className="calendar-facts">
        <dt>{t.projects.calendar.workingDays}</dt>
        <dd>
          {effective.workingDays
            .map((day: Weekday) => t.projects.calendar.days[day])
            .join(' · ')}
        </dd>
        <dt>{t.projects.calendar.hours}</dt>
        <dd>{`${asTime(effective.hours.startMinute)}–${asTime(effective.hours.endMinute)}`}</dd>
      </dl>

      {project.calendar.overrides !== null ? (
        <p className="calendar-badge">{t.projects.calendar.overridden}</p>
      ) : null}

      {/* Surfaced, never applied: the newer version is offered and waits to be chosen. */}
      {outdated && canManage ? (
        <div className="calendar-adopt">
          <p className="panel__lede">{t.projects.calendar.outdated}</p>

          {project.calendar.overrides !== null ? (
            <label className="calendar-keep">
              <input
                type="checkbox"
                checked={keepOverrides}
                onChange={(e) => setKeepOverrides(e.target.checked)}
              />
              <span>{t.projects.calendar.keepOverrides}</span>
            </label>
          ) : null}

          <button
            type="button"
            className="btn btn--ghost btn--sm"
            disabled={busy}
            onClick={() => onAdopt(keepOverrides)}
          >
            {t.projects.calendar.adopt}
            {busy ? <ButtonSpinner /> : null}
          </button>
        </div>
      ) : null}
    </section>
  );
};
