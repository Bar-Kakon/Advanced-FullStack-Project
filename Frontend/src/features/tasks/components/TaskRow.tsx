import { Link } from 'react-router-dom';

import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import { formatCalendarDate } from '../../../i18n/dateFormat';
import type { MyTask } from '../../../api/tasks.types';


export interface TaskRowProps {
  readonly task: MyTask;
  readonly busy: boolean;
  readonly busyId: string | null;
  readonly onStart: (taskId: string) => void;
  readonly onComplete: (taskId: string) => void;
}

export const TaskRow = ({ task, busy, busyId, onStart, onComplete }: TaskRowProps) => {
  const { t, lang } = useLanguage();

  const lateness =
    task.overdueDays === 1
      ? t.tasks.overdueByOne
      : task.overdueDays === 2
        ? t.tasks.overdueByTwo
        : t.tasks.overdueBy.replace('{days}', String(task.overdueDays));

  return (
    <li className={`task-row${task.overdue ? ' task-row--overdue' : ''}`}>
      <div className="task-row__head">
        <h3 className="task-row__title" dir="auto">{task.title}</h3>
        <span className="task-row__badges">
          <span className={`task-chip task-chip--${task.kind}`}>{t.tasks.kind[task.kind]}</span>
          <span className={`task-chip task-chip--${task.state}`}>{t.tasks.state[task.state]}</span>
          {task.overdue ? <span className="task-chip task-chip--overdue">{t.tasks.overdue}</span> : null}
          {task.pendingProposal === true ? (
            <span className="task-chip task-chip--proposal">{t.tasks.row.pendingProposal}</span>
          ) : null}
        </span>
      </div>

      {task.description ? (
        <p className="task-row__desc" dir="auto">{task.description}</p>
      ) : null}

      <p className="task-row__meta">
        {/* A delegate is never told the project, so the slot is simply absent for them. */}
        <span dir="auto">{task.project ? task.project.name : t.tasks.row.noProject}</span>
        <span>
          {task.completedAt !== null
            ? t.tasks.row.completedOn.replace('{date}', formatCalendarDate(task.completedAt.slice(0, 10), lang))
            : t.tasks.row.due.replace('{date}', formatCalendarDate(task.dueDate, lang))}
        </span>
        {task.overdue ? <span className="task-row__late">{lateness}</span> : null}
      </p>

      {/* The counterparty is resolved per viewer. `null` means nobody, and the row says so. */}
      <p className="task-row__meta">
        <span dir="auto">
          {task.counterparty === null
            ? t.tasks.row.selfOpened
            : t.tasks.row.from.replace('{name}', task.counterparty.name)}
        </span>
        {task.viewerIsDelegate ? (
          <span className="task-row__note">{t.tasks.row.performing}</span>
        ) : task.delegated ? (
          <span className="task-row__note">{t.tasks.row.delegated}</span>
        ) : null}
      </p>

      {task.orphaned ? <p className="task-row__note">{t.tasks.row.orphaned}</p> : null}

      {/* Only what the server said this viewer may do. Nothing is offered that would be refused. */}
      <div className="task-row__actions">
        <Link to={`/tasks/${task.id}`} className="btn btn--ghost btn--sm">{t.tasks.detail.title}</Link>
      </div>

      {task.canStart || task.canComplete ? (
        <div className="task-row__actions">
          {task.canStart ? (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={busy}
              onClick={() => onStart(task.id)}
            >
              {t.tasks.start}
              {busyId === task.id ? <ButtonSpinner /> : null}
            </button>
          ) : null}
          {task.canComplete ? (
            <button
              type="button"
              className="btn btn--primary btn--sm"
              disabled={busy}
              onClick={() => onComplete(task.id)}
            >
              {t.tasks.complete}
              {busyId === task.id ? <ButtonSpinner /> : null}
            </button>
          ) : null}
        </div>
      ) : null}
    </li>
  );
};
