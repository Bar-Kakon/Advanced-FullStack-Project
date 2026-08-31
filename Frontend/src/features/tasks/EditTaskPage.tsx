import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { FormAlert } from '../../components/FormAlert';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import { editTask, fetchEditableFields, type EditableFields } from '../../api/editTask.api';
import { fetchTaskDetail } from '../../api/taskDetail.api';
import type { TaskDetail } from '../../api/taskDetail.types';
import profileCss from '../profile/profile.css?inline';
import createTaskCss from './create-task.css?inline';
import tasksCss from './tasks.css?inline';

type EditFailure = 'network' | 'save' | 'datesNeedProposal' | 'empty' | 'dueBeforeStart';

const CODES: Readonly<Record<string, EditFailure>> = {
  TASK_EDIT_DATES_NEED_PROPOSAL: 'datesNeedProposal',
  TASK_EDIT_EMPTY: 'empty',
  DUE_BEFORE_START: 'dueBeforeStart',
};

const classify = (error: unknown): EditFailure => {
  const response = (error as { response?: { data?: { code?: string } } }).response;
  if (response === undefined) return 'network';
  return CODES[response.data?.code ?? ''] ?? 'save';
};

/**
 * Edit Task, in the vocabulary Create Task and Task Detail already use.
 *
 * The screen draws the boundary rather than hiding it: the fields that are edited here sit in one
 * group, and the dates sit in their own, which on project work is a link into the date-change flow
 * instead of an input. Responsibility is not on this screen at all — it moves through the handoff.
 */
export const EditTaskPage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { taskId = '' } = useParams<{ taskId: string }>();

  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'tasks.css', css: tasksCss },
    { id: 'create-task.css', css: createTaskCss },
  );
  useDocumentTitle(`${t.editTask.title} — FieldSync`);

  const [task, setTask] = useState<TaskDetail | null>(null);
  const [editable, setEditable] = useState<EditableFields | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<EditFailure | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [ownCrewOnly, setOwnCrewOnly] = useState(false);
  const [onSite, setOnSite] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetchTaskDetail(taskId, controller.signal),
      fetchEditableFields(taskId, controller.signal),
    ])
      .then(([detail, fields]) => {
        setTask(detail);
        setEditable(fields);
        setTitle(detail.title);
        setDescription(detail.description ?? '');
        setStartDate(detail.startDate);
        setDueDate(detail.dueDate);
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailure('save');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [taskId]);

  const save = async (): Promise<void> => {
    setBusy(true);
    setSaved(false);
    try {
      await editTask(taskId, {
        title,
        description: description.trim().length === 0 ? null : description,
        ownCrewOnly,
        delegatorOnSiteRequired: onSite,
        // Sent only where the server said they may be edited here, which is standalone work alone.
        ...(editable?.canEditDatesDirectly === true ? { startDate, dueDate } : {}),
      });
      setSaved(true);
      setFailure(null);
    } catch (error) {
      setFailure(classify(error));
    } finally {
      setBusy(false);
    }
  };

  const name = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();

  return (
    <>
      <AppNav name={name} initials={initialsOf(user?.firstName ?? '', user?.lastName ?? '')} />

      <main className="profile-main">
        <header className="profile-header">
          <h1 className="profile-title">{t.editTask.title}</h1>
          <p className="profile-lede">{t.editTask.lede}</p>
        </header>

        {failure === null ? null : (
          <FormAlert message={failure === 'network' ? t.editTask.errors.network : t.editTask.errors[failure]} />
        )}
        {saved ? <FormAlert message={t.editTask.saved} /> : null}

        {loading ? (
          <p className="settings-empty">{t.editTask.loading}</p>
        ) : editable?.canEditDetails !== true ? (
          <FormAlert message={t.editTask.notPermitted} />
        ) : (
          <>
            <section className="create-task-panel">
              <div className="form-group">
                <label className="form-label" htmlFor="edit-title">{t.editTask.taskTitle}</label>
                <input
                  id="edit-title"
                  className="form-input"
                  type="text"
                  maxLength={200}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                />
              </div>

              <div className="form-group">
                <label className="form-label" htmlFor="edit-description">
                  {t.editTask.description}
                </label>
                <textarea
                  id="edit-description"
                  className="form-input"
                  rows={4}
                  maxLength={2000}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                />
              </div>

              <label className="settings-choice">
                <input
                  type="checkbox"
                  checked={ownCrewOnly}
                  onChange={(event) => setOwnCrewOnly(event.target.checked)}
                />
                <span className="settings-choice__label">{t.editTask.ownCrewOnly}</span>
              </label>

              <label className="settings-choice">
                <input
                  type="checkbox"
                  checked={onSite}
                  onChange={(event) => setOnSite(event.target.checked)}
                />
                <span className="settings-choice__label">{t.editTask.delegatorOnSiteRequired}</span>
              </label>
            </section>

            <section className="create-task-panel" aria-labelledby="edit-dates">
              <h2 className="exc-panel__title" id="edit-dates">{t.editTask.datesTitle}</h2>

              {editable.canEditDatesDirectly ? (
                <>
                  <p className="exc-panel__note">{t.editTask.datesDirectNote}</p>
                  <div className="exc-form">
                    <div className="form-group">
                      <label className="form-label" htmlFor="edit-start">{t.editTask.startDate}</label>
                      <input
                        id="edit-start"
                        className="form-input"
                        type="date"
                        value={startDate}
                        onChange={(event) => setStartDate(event.target.value)}
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label" htmlFor="edit-due">{t.editTask.dueDate}</label>
                      <input
                        id="edit-due"
                        className="form-input"
                        type="date"
                        value={dueDate}
                        onChange={(event) => setDueDate(event.target.value)}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <>
                  {/* No date input is drawn at all: the field does not change this way, and an
                      input that always failed would be a worse answer than the explanation. */}
                  <p className="exc-panel__note">{t.editTask.datesThroughProposal}</p>
                  <p className="exc-row__dates">
                    {task?.startDate} – {task?.dueDate}
                  </p>
                  <Link to={`/tasks/${taskId}`} className="btn btn--ghost">
                    {t.editTask.goToDateChange}
                  </Link>
                </>
              )}
            </section>

            <p className="exc-panel__note">{t.editTask.responsibilityNote}</p>

            <div className="settings-actions">
              <button
                type="button"
                className="btn btn--primary"
                disabled={busy}
                onClick={() => void save()}
              >
                {t.editTask.save}
                {busy ? <ButtonSpinner /> : null}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => navigate(`/tasks/${taskId}`)}
              >
                {t.editTask.cancel}
              </button>
            </div>
          </>
        )}
      </main>
    </>
  );
};
