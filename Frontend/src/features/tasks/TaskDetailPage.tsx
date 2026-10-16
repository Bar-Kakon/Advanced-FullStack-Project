import { Link, useParams } from 'react-router-dom';

import { api } from '../../api/client';

import { AppNav } from '../../components/AppNav';
import { FormAlert } from '../../components/FormAlert';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { formatCalendarDate } from '../../i18n/dateFormat';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import { DelegationPanel } from './components/DelegationPanel';
import { PrivateWorkPanel } from './components/PrivateWorkPanel';
import { DateChangePanel } from './components/DateChangePanel';
import { StandaloneDatesPanel } from './components/StandaloneDatesPanel';
import { HandoffPanel } from './components/HandoffPanel';
import { WorkPlansPanel } from './components/WorkPlansPanel';
import { useTaskDetail } from './useTaskDetail';
import profileCss from '../profile/profile.css?inline';
import projectsCss from '../projects/projects.css?inline';
import permissionsCss from '../permissions/permissions.css?inline';
import dashboardCss from '../projectdashboard/project-dashboard.css?inline';
import tasksCss from './tasks.css?inline';
import coordinationCss from '../coordination/coordination.css?inline';


/**
 * One piece of work, seen from where this viewer stands.
 *
 * Everything privacy-sensitive was decided by the server: a delegate simply receives no project,
 * no stage and no sequence, so there is nothing here to hide by hand.
 */
const formatFileSize = (bytes: number): string =>
  bytes >= 1_048_576 ? `${(bytes / 1_048_576).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

const downloadAgreementDocument = async (taskId: string, fileId: string, filename: string): Promise<void> => {
  const { data } = await api.get<Blob>(`/tasks/${taskId}/agreement-files/${fileId}`, { responseType: 'blob' });
  const url = URL.createObjectURL(data);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const TaskDetailPage = () => {
  const { t, lang } = useLanguage();
  const { user } = useAuth();
  const { taskId = '' } = useParams<{ taskId: string }>();
  const {
    task, privateItems, loading, busy, failure, reload,
    delegate, endDelegation, addPrivate, togglePrivate, updatePrivate, removePrivate,
  } = useTaskDetail(taskId);

  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'projects.css', css: projectsCss },
    { id: 'permissions.css', css: permissionsCss },
    { id: 'project-dashboard.css', css: dashboardCss },
    { id: 'tasks.css', css: tasksCss },
    { id: 'coordination.css', css: coordinationCss },
  );
  useDocumentTitle('פרטי העבודה / Work detail — Blokta');

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
            {/* Offered to everyone who can reach the task; the edit screen asks the server what
                this viewer may actually change before drawing a single field. */}
            {task === null ? null : (
              <Link to={`/tasks/${task.id}/edit`} className="btn btn--ghost btn--sm">
                {t.editTask.title}
              </Link>
            )}
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
                    .replace('{start}', formatCalendarDate(task.startDate, lang))
                    .replace('{due}', formatCalendarDate(task.dueDate, lang))}
                </dd>

                <dt>
                  {task.fromAgreement
                    ? t.tasks.row.workOwnerLabel
                    : t.tasks.row.from.replace('{name}', '').trim()}
                </dt>
                <dd dir="auto">
                  {task.counterparty === null
                    ? t.tasks.row.selfOpened
                    : task.counterparty.name}
                </dd>
              </dl>

              {task.description ? <p className="dash-note" dir="auto">{task.description}</p> : null}
              {task.orphaned ? <p className="dash-note dash-note--flag">{t.tasks.row.orphaned}</p> : null}
            </section>

            {task.agreementDocuments.length > 0 ? (
              <section className="panel" aria-labelledby="agreement-docs-title">
                <h2 id="agreement-docs-title" className="panel__title">{copy.documents.title}</h2>
                <p className="panel__lede">{copy.documents.lede}</p>
                <ul className="tool-list">
                  {task.agreementDocuments.map((doc) => (
                    <li key={doc.id} className="tool-list__item">
                      <div className="tool-list__text">
                        <span className="tool-list__name" dir="ltr">{doc.filename}</span>
                        <p className="tool-list__lede" dir="ltr">
                          {doc.mimeType} · {formatFileSize(doc.sizeBytes)}
                        </p>
                      </div>
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        onClick={() => void downloadAgreementDocument(task.id, doc.id, doc.filename)}
                      >
                        {copy.documents.download}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* Dependencies are between stages. Standalone work has no stage, so the section
                is not drawn at all; a delegate receives none of this either way. */}
            {task.kind === 'standalone' ? null : (
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
            )}

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
                onEdit={(id, body) => void updatePrivate(id, body)}
                onRemove={(id) => void removePrivate(id)}
              />
            ) : null}

            {task.kind === 'standalone' ? (
              task.viewerIsDelegate ? null : <StandaloneDatesPanel task={task} />
            ) : (
              <DateChangePanel
                taskId={task.id}
                available={task.rescheduleAvailable && task.viewer.canRequestDateChange}
                impact={task.rescheduleImpact}
              />
            )}

            <HandoffPanel
              taskId={task.id}
              projectId={task.project?.id ?? null}
              onResponsibilityChanged={() => void reload()}
            />

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
