import type { ReactNode } from 'react';

import { useLanguage } from '../../../i18n/useLanguage';
import type { CompletedWorkEntry } from '../profileModel';

/**
 * Completed work. My profile renders it read-only; Edit profile passes `manage`, which turns it
 * into the manager the approved edit screen has always carried — a remove control on every tile
 * and an add tile at the end of the grid.
 *
 * The badge appears only where the work the entry represents is itself complete, and it says the
 * completion is *recorded*, not that it was good.
 *
 * The lede is a prop rather than a fixed string: the two screens say different things about the
 * same section on purpose. The view screen explains what the badge means to someone reading it;
 * the edit screen explains what may be put here and that linking an entry is optional — which is
 * only in question while entries are being added.
 */
export const CompletedWorkPanel = ({
  entries,
  lede,
  manage,
  notice = null,
}: {
  entries: readonly CompletedWorkEntry[];
  lede: string;
  /** Absent on the read view. Present on Edit profile, where the section is editable. */
  manage?: {
    addLabel: string;
    removeLabel: string;
    onAdd: () => void;
    onRemove: (id: string) => void;
  };
  /** Anything the screen needs to say about what just happened to the list. */
  notice?: ReactNode;
}) => {
  const { t } = useLanguage();

  return (
    <section className="panel panel--work" aria-labelledby="work-title">
      <h2 id="work-title" className="panel__title">{t.profile.work.title}</h2>
      <p className="panel__lede">{lede}</p>
      <ul className="work-grid">
        {entries.map((entry) => (
          <li className="work-item" key={entry.id}>
            {manage ? (
              <button
                type="button"
                className="work-item__remove"
                aria-label={manage.removeLabel}
                onClick={() => manage.onRemove(entry.id)}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                     strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
              </button>
            ) : null}
            <span className="work-item__thumb" aria-hidden="true">
              <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <circle cx="8.5" cy="9.5" r="1.5" />
                <path d="M21 15l-5-5L5 20" />
              </svg>
            </span>
            <div className="work-item__body">
              <p className="work-item__title" dir="auto">{entry.title}</p>
              {entry.scope ? <p className="work-item__scope" dir="auto">{entry.scope}</p> : null}
              <p className="work-item__meta">{entry.meta}</p>
              {entry.onFieldSync ? (
                <span className="work-badge">
                  <svg className="work-badge__icon" width="15" height="15" viewBox="0 0 24 24" fill="none"
                       stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M12 2 20.7 7 20.7 17 12 22 3.3 17 3.3 7Z" strokeWidth="1.7" />
                    <path d="M8.4 12.2 10.9 14.7 15.6 9.6" strokeWidth="2.1" />
                  </svg>
                  {t.profile.work.badge}
                </span>
              ) : null}
            </div>
          </li>
        ))}
        {manage ? (
          <li>
            <button type="button" className="work-add" onClick={manage.onAdd}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                   strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              {manage.addLabel}
            </button>
          </li>
        ) : null}
      </ul>
      {notice}
    </section>
  );
};
