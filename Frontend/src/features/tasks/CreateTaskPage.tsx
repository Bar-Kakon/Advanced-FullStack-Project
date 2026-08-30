import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { FormAlert } from '../../components/FormAlert';
import { SelectField } from '../../components/SelectField';
import { TextField } from '../../components/TextField';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import { useCreateTask } from './useCreateTask';
import type { TaskKind } from '../../api/tasks.types';
import profileCss from '../profile/profile.css?inline';
import editProfileCss from '../profile/edit-profile.css?inline';
import projectsCss from '../projects/projects.css?inline';
import tasksCss from './tasks.css?inline';
import createTaskCss from './create-task.css?inline';

/**
 * Screen #17, create only.
 *
 * Every control on it is one the API confirmed this account may use: the project list holds only
 * projects it may open work in, the assignee list only active members, and the assignee control is
 * absent rather than disabled when the account may open work in its own name alone.
 */
export const CreateTaskPage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [stageName, setStageName] = useState('');
  const [stageIsGate, setStageIsGate] = useState(false);

  const copy = t.tasks.create;
  const fromProject = params.get('projectId') ?? undefined;
  const { values, set, options, window, loading, loadingProject, saving, failure, errors, submit, addStage } =
    useCreateTask(user?.id ?? '', fromProject);

  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'edit-profile.css', css: editProfileCss },
    { id: 'projects.css', css: projectsCss },
    { id: 'tasks.css', css: tasksCss },
    { id: 'create-task.css', css: createTaskCss },
  );
  useDocumentTitle('פתיחת עבודה / Open work — FieldSync');

  const firstName = user?.firstName ?? '';
  const lastName = user?.lastName ?? '';

  const message =
    failure === 'NETWORK' ? copy.errors.network
      : failure === 'NOT_FOUND' ? copy.errors.notFound
        : failure === 'CREATE_DENIED' ? copy.errors.createDenied
          : failure === 'ASSIGN_DENIED' ? copy.errors.assignDenied
            : failure === 'STANDALONE_DENIED' ? copy.errors.standaloneDenied
              : failure === 'OUTSIDE_WINDOW' ? copy.errors.outsideWindow
                : failure === 'DUE_BEFORE_START' ? copy.errors.dueBeforeStart
                  : failure === 'ASSIGNEE_NOT_MEMBER' ? copy.errors.assigneeNotMember
                    : failure === 'STAGE_NOT_FOUND' ? copy.errors.stageNotFound
                      : failure === 'INVALID_DATE' ? copy.errors.invalidDate
                        : copy.errors.unknown;

  const canOpenProject = (options?.projects.length ?? 0) > 0;
  const canOpenStandalone = options?.canCreateStandalone ?? false;
  const kinds: readonly TaskKind[] = [
    ...(canOpenProject ? (['project'] as const) : []),
    ...(canOpenStandalone ? (['standalone'] as const) : []),
  ];

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const result = await submit({
      required: copy.errors.required,
      dueBeforeStart: copy.errors.dueBeforeStart,
      outsideWindow: copy.errors.outsideWindow,
    });
    // The new work opens on its own detail screen, which is where every warning is already shown.
    if (result !== null) navigate(`/tasks/${result.task.id}`);
  };

  return (
    <div className="app">
      <AppNav name={`${firstName} ${lastName}`.trim()} initials={initialsOf(firstName, lastName)} />

      <main className="profile">
        <header className="profile__head">
          <div className="profile__head-text">
            <h1 className="profile__title">{copy.title}</h1>
            <p className="profile__sub">{copy.lede}</p>
          </div>
          <Link to="/tasks" className="btn btn--ghost btn--sm">{copy.back}</Link>
        </header>

        {failure !== null ? (
          <section className="panel"><FormAlert message={message} /></section>
        ) : null}

        {loading ? (
          <section className="panel">
            <p className="panel__lede" role="status">{copy.loading}</p>
          </section>
        ) : null}

        {!loading && kinds.length === 0 ? (
          <section className="panel">
            <p className="panel__lede">{copy.nothing}</p>
          </section>
        ) : null}

        {!loading && kinds.length > 0 ? (
          <form className="panel" onSubmit={(e) => void onSubmit(e)} noValidate>
            {/* Two kinds, and only the ones this account may actually open. */}
            {kinds.length > 1 ? (
              <fieldset className="create-kind">
                <legend className="field-label">{copy.kind.label}</legend>
                {kinds.map((kind) => (
                  <label key={kind} className="create-choice" htmlFor={`kind-${kind}`}>
                    <input
                      id={`kind-${kind}`}
                      type="radio"
                      name="kind"
                      value={kind}
                      checked={values.kind === kind}
                      onChange={() => set('kind', kind)}
                    />
                    <span>{copy.kind[kind]}</span>
                  </label>
                ))}
              </fieldset>
            ) : null}

            {values.kind === 'standalone' ? (
              <p className="create-note" role="note">{copy.kind.standaloneNote}</p>
            ) : null}

            {values.kind === 'project' ? (
              <SelectField
                id="projectId"
                label={copy.project.label}
                placeholder={copy.project.placeholder}
                value={values.projectId}
                onChange={(v) => set('projectId', v)}
                required
                options={(options?.projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
                {...(errors.projectId ? { error: errors.projectId, touched: true } : {})}
              />
            ) : null}

            {values.kind === 'project' && loadingProject ? (
              <p className="panel__lede" role="status">{copy.loadingProject}</p>
            ) : null}

            {values.kind === 'project' && window !== null ? (
              <>
                <p className="create-note" role="note">
                  {copy.window.replace('{start}', window.startDate).replace('{end}', window.endDate)}
                </p>

                {window.stages.length > 0 ? (
                  <SelectField
                    id="stageId"
                    label={copy.stage.label}
                    placeholder={copy.stage.placeholder}
                    hint={copy.stage.note}
                    value={values.stageId}
                    onChange={(v) => set('stageId', v)}
                    required
                    options={window.stages.map((s) => ({
                      value: s.id,
                      label: s.isGate ? `${s.name} — ${copy.stage.gate}` : s.name,
                    }))}
                    {...(errors.stageId ? { error: errors.stageId, touched: true } : {})}
                  />
                ) : (
                  <p className="create-note" role="note">{copy.stage.none}</p>
                )}

                {/* A project with no stage cannot carry a task, so the way to make one is here. */}
                {window.canManageStages ? (
                  <div className="create-stage">
                    <p className="create-stage__title">{copy.stage.addTitle}</p>
                    <div className="create-stage__row">
                      <TextField
                        id="stageName"
                        label={copy.stage.addLabel}
                        placeholder={copy.stage.addPlaceholder}
                        value={stageName}
                        onChange={setStageName}
                      />
                      <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        disabled={saving || stageName.trim().length === 0}
                        onClick={() => {
                          void addStage(stageName.trim(), stageIsGate);
                          setStageName('');
                          setStageIsGate(false);
                        }}
                      >
                        {copy.stage.add}
                        {saving ? <ButtonSpinner /> : null}
                      </button>
                    </div>
                    <label className="create-choice" htmlFor="stageIsGate">
                      <input
                        id="stageIsGate"
                        type="checkbox"
                        checked={stageIsGate}
                        onChange={(e) => setStageIsGate(e.target.checked)}
                      />
                      <span>{copy.stage.addGate}</span>
                    </label>
                  </div>
                ) : (
                  <p className="create-note" role="note">{copy.stage.cannotAdd}</p>
                )}

                {/* Absent, not disabled: without task.assign the work can only be your own. */}
                {window.canAssignOthers ? (
                  <SelectField
                    id="assigneeId"
                    label={copy.assignee.label}
                    placeholder={copy.assignee.placeholder}
                    hint={copy.assignee.note}
                    value={values.assigneeId}
                    onChange={(v) => set('assigneeId', v)}
                    required
                    options={window.assignees.map((a) => ({
                      value: a.userId,
                      label: a.companyName ? `${a.name} — ${a.companyName}` : a.name,
                    }))}
                    {...(errors.assigneeId ? { error: errors.assigneeId, touched: true } : {})}
                  />
                ) : (
                  <p className="create-note" role="note">{copy.assignee.selfOnly}</p>
                )}
              </>
            ) : null}

            <TextField
              id="title"
              label={copy.titleField.label}
              placeholder={copy.titleField.placeholder}
              value={values.title}
              onChange={(v) => set('title', v)}
              required
              {...(errors.title ? { error: errors.title, touched: true } : {})}
            />

            <div className="form-group">
              <label className="field-label" htmlFor="description">{copy.description.label}</label>
              <textarea
                id="description"
                className="form-input form-input--area"
                rows={3}
                dir="auto"
                placeholder={copy.description.placeholder}
                value={values.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </div>

            <div className="project-dates">
              <TextField
                id="startDate"
                type="date"
                label={copy.startDate.label}
                value={values.startDate}
                onChange={(v) => set('startDate', v)}
                required
                {...(errors.startDate ? { error: errors.startDate, touched: true } : {})}
              />
              <TextField
                id="dueDate"
                type="date"
                label={copy.dueDate.label}
                value={values.dueDate}
                onChange={(v) => set('dueDate', v)}
                required
                {...(errors.dueDate ? { error: errors.dueDate, touched: true } : {})}
              />
            </div>

            {/* The GC's two terms are set with the work, and travel with it to whoever takes it. */}
            {values.kind === 'project' ? (
              <fieldset className="create-terms">
                <legend className="field-label">{copy.terms.title}</legend>
                <p className="create-note">{copy.terms.lede}</p>
                <label className="create-choice" htmlFor="ownCrewOnly">
                  <input
                    id="ownCrewOnly"
                    type="checkbox"
                    checked={values.ownCrewOnly}
                    onChange={(e) => set('ownCrewOnly', e.target.checked)}
                  />
                  <span>
                    {copy.terms.ownCrewOnly}
                    <span className="field-hint">{copy.terms.ownCrewOnlyHint}</span>
                  </span>
                </label>
                <label className="create-choice" htmlFor="delegatorOnSiteRequired">
                  <input
                    id="delegatorOnSiteRequired"
                    type="checkbox"
                    checked={values.delegatorOnSiteRequired}
                    onChange={(e) => set('delegatorOnSiteRequired', e.target.checked)}
                  />
                  <span>
                    {copy.terms.onSite}
                    <span className="field-hint">{copy.terms.onSiteHint}</span>
                  </span>
                </label>
              </fieldset>
            ) : null}

            <div className="project-form__actions">
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {copy.submit}
                {saving ? <ButtonSpinner /> : null}
              </button>
              <Link to="/tasks" className="btn btn--ghost">{copy.cancel}</Link>
            </div>
          </form>
        ) : null}
      </main>
    </div>
  );
};
