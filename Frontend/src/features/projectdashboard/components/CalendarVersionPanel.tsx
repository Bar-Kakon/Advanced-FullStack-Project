import { useLanguage } from '../../../i18n/useLanguage';
import type { ProjectCalendarState } from '../../../api/projectDashboard.types';

const displayDate = (iso: string, lang: 'he' | 'en'): string =>
  new Date(iso).toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

/**
 * Which frozen company version this project is pinned to, whether a newer one exists, and every
 * move it has ever made between them. The pin is the whole safety rule: a company edit appends a
 * version and this number does not follow it.
 */
export const CalendarVersionPanel = ({ calendar }: { calendar: ProjectCalendarState }) => {
  const { t, lang } = useLanguage();
  const copy = t.projectDashboard.calendarPanel;

  return (
    <section className="panel" aria-labelledby="calendar-version-title">
      <h2 id="calendar-version-title" className="panel__title">{copy.title}</h2>

      <p className="panel__lede">
        {calendar.versionNumber === null
          ? copy.unknown
          : copy.pinned.replace('{version}', String(calendar.versionNumber))}
      </p>

      {calendar.currentVersionNumber !== null ? (
        <p className="dash-note">
          {copy.current.replace('{version}', String(calendar.currentVersionNumber))}
        </p>
      ) : null}

      <p className={`dash-note${calendar.outdated ? ' dash-note--flag' : ''}`}>
        {calendar.outdated ? copy.outdated : copy.upToDate}
      </p>

      {calendar.overridden ? <p className="dash-note">{copy.overridden}</p> : null}

      <h3 className="dash-subtitle">{copy.historyTitle}</h3>
      {calendar.adoptions.length === 0 ? (
        <p className="panel__lede">{copy.historyNone}</p>
      ) : (
        <ul className="dash-history">
          {calendar.adoptions.map((adoption) => (
            <li key={`${adoption.toVersion}-${adoption.adoptedAt}`} className="dash-history__row">
              <span dir="auto">
                {(adoption.fromVersion === null ? copy.historyFirst : copy.historyRow)
                  .replace('{from}', String(adoption.fromVersion ?? ''))
                  .replace('{to}', String(adoption.toVersion))
                  .replace('{name}', adoption.adoptedByName ?? '—')}
              </span>
              <span className="dash-history__meta">
                {`${displayDate(adoption.adoptedAt, lang)} · ${
                  adoption.overridesKept ? copy.historyKept : copy.historyDropped
                }`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
