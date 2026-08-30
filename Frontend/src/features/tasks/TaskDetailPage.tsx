import { Link, useParams } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { FormAlert } from '../../components/FormAlert';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import { DelegationPanel } from './components/DelegationPanel';
import { PrivateWorkPanel } from './components/PrivateWorkPanel';
import { WorkPlansPanel } from './components/WorkPlansPanel';
import { useTaskDetail } from './useTaskDetail';
import profileCss from '../profile/profile.css?inline';
import projectsCss from '../projects/projects.css?inline';
import permissionsCss from '../permissions/permissions.css?inline';
import dashboardCss from '../projectdashboard/project-dashboard.css?inline';
import tasksCss from './tasks.css?inline';

const displayDate = (iso: string, lang: 'he' | 'en'): string => {
  const [year, month, day] = iso.split('-').map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString(
    lang === 'he' ? 'he-IL' : 'en-GB',
    { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' },
  );
};

/**
 * One piece of work, seen from where this viewer stands.
 *
 * Everything privacy-sensitive was decided by the server: a delegate simply receives no project,
 * no stage and no sequence, so there is nothing here to hide by hand.
 */
export const TaskDetailPage = () => {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const { taskId = '' } = useParams<{ taskId: string }>();
  const {
    task, privateItems, loading, busy, failure, reload,
    delegate, endDelegation, addPrivate, togglePrivate, removePrivate,
  } = useTaskDetail(taskId);

  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'projects.css', css: projectsCss },
    { id: 'permissions.css', css: permissionsCss },
    { id: 'project-dashboard.css', css: dashboardCss },
    { id: 'tasks.css', css: tasksCss },
  );
  useDocumentTitle('פרטי העבודה / Work detail — FieldSync');

  const firstName = user?.firstName ?? '';
  const lastName = user?.lastName ?? '';
  const copy = t.tasks.detail;

  const message =
    failure === 'NETWORK' ? t.tasks.errors.network
      : failure === 'NOT_FOUND' ? copy.notFound
        : failure === 'NOT_THE_PERFORMER' ? t.tasks.errors.notPerformer
          : failure === 'ALREADY' ? t.tasks.errors.already
            : failure === 'ORPHANED' ? t.tasks.errors.orphaned
              : t.tasks.errors.unknown;

  return (
    <div className="app">
      <AppNav name={`${firstName} ${lastName}`.trim()} initials={initialsOf(firstName, lastName)} />

      <main className="profile">
        <header className="profile__head">
          <div className="profile__head-text">
            <h1 className="profile__title" dir="auto">{task?.title ?? copy.title}</h1>
            <p className="profile__sub">{copy.title}</p>
          </div>
          <div className="profile__head-actions">
            <Link to="/tasks" className="btn btn--ghost btn--sm">{copy.back}</Link>
          </div>
        </header>

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
            <p className="panel__lede" role="status">{copy.loading}</p>
          </section>
        ) : null}

        {!loading && task !== null ? (
          <>
            <section className="panel" aria-labelledby="task-summary-title">
              <h2 id="task-summary-title" className="panel__title">{copy.title}</h2>
              <dl className="dash-facts">
                <dt>{t.tasks.filters.kind.label}</dt>
                <dd>{t.tasks.kind[task.kind]}</dd>

                <dt>{t.tasks.filters.project.label}</dt>
                <dd dir="auto">{task.project ? task.project.name : t.tasks.row.noProject}</dd>

                <dt>{t.tasks.filters.state.label}</dt>
                <dd>
                  <span className={`task-chip task-chip--${task.state}`}>{t.tasks.state[task.state]}</span>
                  {task.overdue ? (
                    <span className="task-chip task-chip--overdue">{t.tasks.overdue}</span>
                  ) : null}
                </dd>

                <dt>{copy.dates.replace('{start}', '').replace('{due}', '').trim() || 'Dates'}</dt>
                <dd>
                  {copy.dates
                    .replace('{start}', displayDate(task.startDate, lang))
                    .replace('{due}', displayDate(task.dueDate, lang))}
                </dd>

                <dt>{t.tasks.row.from.replace('{name}', '').trim()}</dt>
                <dd dir="auto">
                  {task.counterparty === null
                    ? t.tasks.row.selfOpened
                    : task.counterparty.name}
                </dd>
              </dl>

              {task.description ? <p className="dash-note" dir="auto">{task.description}</p> : null}
              {task.orphaned ? <p className="dash-note dash-note--flag">{t.tasks.row.orphaned}</p> : null}
            </section>

            {/* Dependencies are between stages. A delegate receives none of this. */}
            <section className="panel" aria-labelledby="stage-title">
              <h2 id="stage-title" className="panel__title">{copy.stage.title}</h2>
              <p className="panel__lede">{copy.stage.note}</p>
              {task.stage === null ? (
                <p className="panel__lede">{copy.stage.none}</p>
              ) : (
                <>
                  <p className="dash-note">
                    {copy.stage.inStage.replace('{name}', task.stage.name)}
                    {task.stage.isGate ? ` · ${copy.stage.gate}` : ''}
                  </p>
                  <h3 className="dash-subtitle">{copy.stage.blockedBy}</h3>
                  {task.blockedBy.length === 0 ? (
                    <p className="panel__lede">{copy.stage.noBlockers}</p>
                  ) : (
                    <ul className="dash-history">
                      {task.blockedBy.map((stage) => (
                        <li key={stage.id} className="dash-history__row">
                          <span dir="auto">{stage.name}</span>
                          <span className="dash-history__meta">
                            {[stage.isGate ? copy.stage.gate : null,
                              stage.partiallyReleased ? copy.stage.partialRelease : null]
                              .filter(Boolean).join(' · ')}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </section>

            <DelegationPanel
              task={task}
              busy={busy}
              onDelegate={(payload) => void delegate(payload)}
              onEnd={() => void endDelegation()}
            />

            {task.viewer.canReport || privateItems.length > 0 ? (
              <PrivateWorkPanel
                items={privateItems}
                busy={busy}
                onAdd={(kind, body) => void addPrivate(kind, body)}
                onToggle={(id, done) => void togglePrivate(id, done)}
                onRemove={(id) => void removePrivate(id)}
              />
            ) : null}

            <section className="panel" aria-labelledby="date-change-title">
              <h2 id="date-change-title" className="panel__title">{copy.dateChange.title}</h2>
              {/* The cascade is closed as policy and unbuilt, so the screen says so and offers nothing. */}
              {task.rescheduleAvailable ? (
                <button type="button" className="btn btn--ghost btn--sm" disabled={busy}>
                  {copy.dateChange.request}
                </button>
              ) : (
                <p className="panel__lede">{copy.dateChange.unavailable}</p>
              )}
            </section>

            <WorkPlansPanel
              taskId={task.id}
              canExchangePrivately={task.delegation !== null || task.viewerIsDelegate}
            />
          </>
        ) : null}
      </main>
    </div>
  );
};
