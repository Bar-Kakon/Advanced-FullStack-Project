import { Link } from 'react-router-dom';

import { useLanguage } from '../../../i18n/useLanguage';
import { formatCalendarDate } from '../../../i18n/dateFormat';
import type { TaskDetail } from '../../../api/taskDetail.types';

export interface StandaloneDatesPanelProps {
  readonly task: TaskDetail;
}

/**
 * Date management for standalone work: the planned dates change on the edit screen, the originally
 * agreed dates stay on record beside them, and every change is listed. No project machinery is
 * drawn here, because none applies.
 */
export const StandaloneDatesPanel = ({ task }: StandaloneDatesPanelProps) => {
  const { t, lang } = useLanguage();
  const copy = t.tasks.detail.standaloneDates;

  const span = (start: string, due: string): string =>
    `${formatCalendarDate(start, lang)} – ${formatCalendarDate(due, lang)}`;

  return (
    <section className="panel" aria-labelledby="standalone-dates-title">
      <h2 id="standalone-dates-title" className="panel__title">{copy.title}</h2>
      <p className="panel__lede">{task.fromAgreement ? copy.ledeAgreement : copy.lede}</p>

      <dl className="dash-facts">
        <dt>{copy.planned}</dt>
        <dd>{span(task.startDate, task.dueDate)}</dd>

        <dt>{copy.originalLabel}</dt>
        <dd>
          {task.originalStartDate !== null && task.originalDueDate !== null
            ? span(task.originalStartDate, task.originalDueDate)
            : copy.originalUnknown}
        </dd>
      </dl>

      <Link to={`/tasks/${task.id}/edit`} className="btn btn--ghost btn--sm">
        {copy.edit}
      </Link>

      <h3 className="dash-subtitle">{copy.historyTitle}</h3>
      {task.dateChanges.length === 0 ? (
        <p className="panel__lede">{copy.historyEmpty}</p>
      ) : (
        <ul className="dash-history">
          {task.dateChanges.map((row, index) => (
            <li key={`${row.at}-${index}`} className="dash-history__row">
              <span>
                {copy.historyRow
                  .replace('{from}', span(row.fromStartDate, row.fromDueDate))
                  .replace('{to}', span(row.toStartDate, row.toDueDate))}
              </span>
              <span className="dash-history__meta">
                {formatCalendarDate(row.at, lang)}
                {row.reason === null ? '' : ` · ${row.reason}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
