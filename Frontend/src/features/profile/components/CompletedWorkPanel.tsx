import { useLanguage } from '../../../i18n/useLanguage';
import type { CompletedWorkEntry } from '../profileModel';

/**
 * Completed work — read-only on both profile screens.
 *
 * The prototype's edit screen carried an add-and-remove manager. It is not here: D13, which is
 * where completed-work entries would be stored, is open — there is no collection, no decision
 * between a `workentries` collection and an embedded array, and no endpoint — so an add button
 * and a per-tile remove would be controls with nowhere to write.
 *
 * The badge appears only where the work the entry represents is itself complete, and it says the
 * completion is *recorded*, not that it was good.
 */
export const CompletedWorkPanel = ({ entries }: { entries: readonly CompletedWorkEntry[] }) => {
  const { t } = useLanguage();

  return (
    <section className="panel panel--work" aria-labelledby="work-title">
      <h2 id="work-title" className="panel__title">{t.profile.work.title}</h2>
      <p className="panel__lede">{t.profile.work.lede}</p>
      <ul className="work-grid">
        {entries.map((entry) => (
          <li className="work-item" key={entry.id}>
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
      </ul>
    </section>
  );
};
