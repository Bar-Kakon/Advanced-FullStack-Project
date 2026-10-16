import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { FormAlert } from '../../components/FormAlert';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import { fetchCommissionedWork } from '../../api/tasks.api';
import type { CommissionedWorkPage } from '../../api/tasks.types';
import { TaskRow } from './components/TaskRow';
import { useMyTasks } from './useMyTasks';
import {
  NO_PROJECT,
  TASK_KINDS,
  TASK_STATES,
  type MyTask,
  type TaskKind,
  type TaskState,
} from '../../api/tasks.types';
import profileCss from '../profile/profile.css?inline';
import projectsCss from '../projects/projects.css?inline';
import tasksCss from './tasks.css?inline';

/**
 * One queue holding project work and standalone work together.
 *
 * The three groups are a rendering of facts the server sent — overdue is a derived comparison, not
 * a status, and every action is one the API confirmed this viewer may take.
 */
export const MyTasksPage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const {
    tasks, filters, setFilters, loading, loadingMore, busyId, failure,
    hasMore, reload, loadMore, start, complete,
  } = useMyTasks();

  // Read-only tracking of work this viewer commissioned. It lives beside the queue and feeds no
  // group, count or filter of it.
  const [commissionedPage, setCommissionedPage] = useState<CommissionedWorkPage | null>(null);
  const [commissionedFailed, setCommissionedFailed] = useState(false);
  useEffect(() => {
    let current = true;
    fetchCommissionedWork()
      .then((page) => {
        if (current) setCommissionedPage(page);
      })
      .catch(() => {
        if (current) setCommissionedFailed(true);
      });
    return () => {
      current = false;
    };
  }, []);

  // Scenarios A–D: a current commissioner always sees the section (empty state included); a
  // former one only while rows still require tracking; everybody else never sees it at all.
  const commissioned = commissionedPage?.commissioned ?? null;
  const showCommissioned =
    commissionedFailed ||
    (commissionedPage !== null &&
      (commissionedPage.canCommission || commissionedPage.commissioned.length > 0));

  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'projects.css', css: projectsCss },
    { id: 'tasks.css', css: tasksCss },
  );
  useDocumentTitle('המשימות שלי / My tasks — Blokta');

  const firstName = user?.firstName ?? '';
  const lastName = user?.lastName ?? '';

  const message =
    failure === 'NETWORK' ? t.tasks.errors.network
      : failure === 'NOT_FOUND' ? t.tasks.errors.notFound
        : failure === 'NOT_THE_PERFORMER' ? t.tasks.errors.notPerformer
          : failure === 'ALREADY' ? t.tasks.errors.already
            : failure === 'ORPHANED' ? t.tasks.errors.orphaned
              : t.tasks.errors.unknown;

  const rows = tasks ?? [];
  // Overdue is a fact about a task, so it groups the list without ever being one of its states.
  const groups: readonly [keyof typeof t.tasks.groups, readonly MyTask[]][] = [
    ['overdue', rows.filter((task) => task.overdue)],
    ['open', rows.filter((task) => !task.overdue && task.state !== 'completed')],
    ['done', rows.filter((task) => !task.overdue && task.state === 'completed')],
  ];

  // Only projects the viewer actually has work in — the control never lists a project with no rows.
  const projectOptions = [...new Map(
    rows.flatMap((task) => (task.project ? [[task.project.id, task.project.name] as const] : [])),
  )].map(([value, label]) => ({ value, label }));

  const busy = busyId !== null;

  return (
    <div className="app">
      <AppNav name={`${firstName} ${lastName}`.trim()} initials={initialsOf(firstName, lastName)} />

      <main className="profile">
        <header className="profile__head">
          <div className="profile__head-text">
            <h1 className="profile__title">{t.tasks.title}</h1>
            <p className="profile__sub">{t.tasks.lede}</p>
          </div>
          <Link to="/tasks/new" className="btn btn--primary btn--sm">{t.tasks.create.entry}</Link>
        </header>

        <section className="panel" aria-labelledby="task-filters-title">
          <h2 id="task-filters-title" className="panel__title">{t.tasks.filters.title}</h2>
          {/* Raw selects, as the Browse rail uses: on a filter the "all" option is a real choice,
              so it must stay selectable — a disabled placeholder cannot be returned to. */}
          <div className="task-filters">
            <div className="form-group">
              <label className="field-label" htmlFor="f-project">{t.tasks.filters.project.label}</label>
              <select
                id="f-project"
                className="form-select"
                value={filters.projectId}
                onChange={(e) => setFilters({ ...filters, projectId: e.target.value })}
              >
                <option value="">{t.tasks.filters.project.all}</option>
                <option value={NO_PROJECT}>{t.tasks.filters.project.none}</option>
                {projectOptions.map((option) => (
                  <option key={option.value} value={option.value}>{option.label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="field-label" htmlFor="f-state">{t.tasks.filters.state.label}</label>
              <select
                id="f-state"
                className="form-select"
                value={filters.state}
                onChange={(e) => setFilters({ ...filters, state: e.target.value as TaskState | '' })}
              >
                <option value="">{t.tasks.filters.state.all}</option>
                {TASK_STATES.map((value) => (
                  <option key={value} value={value}>{t.tasks.state[value]}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="field-label" htmlFor="f-kind">{t.tasks.filters.kind.label}</label>
              <select
                id="f-kind"
                className="form-select"
                value={filters.kind}
                onChange={(e) => setFilters({ ...filters, kind: e.target.value as TaskKind | '' })}
              >
                <option value="">{t.tasks.filters.kind.all}</option>
                {TASK_KINDS.map((value) => (
                  <option key={value} value={value}>{t.tasks.kind[value]}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="field-label" htmlFor="f-sort">{t.tasks.filters.sort.label}</label>
              <select
                id="f-sort"
                className="form-select"
                value={filters.sort}
                onChange={(e) =>
                  setFilters({ ...filters, sort: e.target.value as 'due_asc' | 'due_desc' })
                }
              >
                <option value="due_asc">{t.tasks.filters.sort.due_asc}</option>
                <option value="due_desc">{t.tasks.filters.sort.due_desc}</option>
              </select>
            </div>
          </div>
        </section>

        {failure !== null ? (
          <section className="panel">
            <FormAlert message={message} />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void reload()}>
              {t.tasks.retry}
            </button>
          </section>
        ) : null}

        {loading ? (
          <section className="panel">
            <p className="panel__lede" role="status">{t.tasks.loading}</p>
          </section>
        ) : null}

        {!loading && rows.length === 0 && failure === null ? (
          <section className="panel">
            <p className="panel__lede">{t.tasks.empty}</p>
            {/* The empty state now points somewhere — the gap the source-of-truth document flagged. */}
            <Link to="/tasks/new" className="btn btn--primary btn--sm">{t.tasks.create.entry}</Link>
          </section>
        ) : null}

        {!loading && rows.length > 0
          ? groups.map(([group, groupRows]) => (
              <section key={group} className="panel" aria-labelledby={`group-${group}`} aria-live="polite">
                <h2 id={`group-${group}`} className="panel__title">{t.tasks.groups[group].title}</h2>
                <p className="panel__lede">{t.tasks.groups[group].lede}</p>
                {groupRows.length === 0 ? (
                  <p className="panel__lede">{t.tasks.groups[group].empty}</p>
                ) : (
                  <ul className="task-list">
                    {groupRows.map((task) => (
                      <TaskRow
                        key={task.id}
                        task={task}
                        busy={busy}
                        busyId={busyId}
                        onStart={(id) => void start(id)}
                        onComplete={(id) => void complete(id)}
                      />
                    ))}
                  </ul>
                )}
              </section>
            ))
          : null}

        {hasMore ? (
          <section className="panel">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {t.tasks.loadMore}
            </button>
          </section>
        ) : null}

        {!showCommissioned ? null : (
          <section className="panel" aria-labelledby="commissioned-title">
            <h2 id="commissioned-title" className="panel__title">{t.tasks.commissioned.title}</h2>
            <p className="panel__lede">{t.tasks.commissioned.lede}</p>

            {commissionedFailed || commissioned === null ? (
              <p className="panel__lede">{t.tasks.commissioned.failure}</p>
            ) : commissioned.length === 0 ? (
              <p className="panel__lede">{t.tasks.commissioned.empty}</p>
            ) : (
              <ul className="task-list">
                {commissioned.map((row) => (
                  <li key={row.id} className={`task-row${row.overdue ? ' task-row--overdue' : ''}`}>
                    <div className="task-row__head">
                      <h3 className="task-row__title" dir="auto">{row.title}</h3>
                      <span className="task-row__badges">
                        <span className={`task-chip task-chip--${row.state}`}>
                          {t.tasks.state[row.state]}
                        </span>
                        {row.overdue ? (
                          <span className="task-chip task-chip--overdue">{t.tasks.overdue}</span>
                        ) : null}
                      </span>
                    </div>
                    <p className="task-row__meta">
                      {row.performer === null ? null : (
                        <span dir="auto">
                          {t.tasks.commissioned.performer.replace('{name}', row.performer.name)}
                        </span>
                      )}
                      <span>{t.tasks.row.due.replace('{date}', row.dueDate)}</span>
                    </p>
                    <p className="task-row__meta">
                      {row.role === 'owner_oversight' && row.commissionedBy !== null ? (
                        <span dir="auto">
                          {t.tasks.commissioned.roleOversight.replace('{name}', row.commissionedBy.name)}
                        </span>
                      ) : row.role === 'trackee' && row.commissionedBy !== null ? (
                        <span dir="auto">
                          {t.tasks.commissioned.roleTrackee.replace('{name}', row.commissionedBy.name)}
                        </span>
                      ) : null}
                      {row.tracking === null ? null : (
                        <span dir="auto">
                          {row.tracking.arrangement === 'owner_only'
                            ? t.tasks.commissioned.arrangementOwnerOnly
                            : (row.tracking.arrangement === 'transferred'
                                ? t.tasks.commissioned.arrangementTransferred
                                : t.tasks.commissioned.arrangementShared
                              ).replace('{name}', row.tracking.trackee?.name ?? '')}
                        </span>
                      )}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}
      </main>
    </div>
  );
};
