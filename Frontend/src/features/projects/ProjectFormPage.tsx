import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { FormAlert } from '../../components/FormAlert';
import { TextField } from '../../components/TextField';
import { SelectField } from '../../components/SelectField';
import { PROJECT_TYPES } from '../../api/projects.types';
import { ProjectCalendarPanel } from './components/ProjectCalendarPanel';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { LocationField } from '../../location/LocationField';
import { initialsOf } from '../profile/profileModel';
import { useProjectForm } from './useProjectForm';
import profileCss from '../profile/profile.css?inline';
import editProfileCss from '../profile/edit-profile.css?inline';
import projectsCss from './projects.css?inline';

/**
 * Create and Edit are one component on two routes: the only difference is whether a project was
 * loaded first. Two files would drift the moment a field is added to one of them.
 */
export const ProjectFormPage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const navigate = useNavigate();
  const { projectId } = useParams<{ projectId: string }>();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const { values, set, project, loading, saving, failure, errors, save, cancel, adoptCalendar, outdatedCalendar } =
    useProjectForm(projectId);

  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'edit-profile.css', css: editProfileCss },
    { id: 'projects.css', css: projectsCss },
  );

  const editing = projectId !== undefined;
  useDocumentTitle(
    editing ? 'עריכת פרויקט / Edit project — FieldSync' : 'פרויקט חדש / New project — FieldSync',
  );

  const firstName = user?.firstName ?? '';
  const lastName = user?.lastName ?? '';

  const messages = {
    required: t.projects.errors.required,
    targetBeforeStart: t.projects.errors.targetBeforeStart,
    overrunCeiling: t.projects.errors.overrunCeiling,
    allowanceRange: t.projects.errors.allowanceRange,
  };

  const failureMessage =
    failure === 'NETWORK'
      ? t.projects.errors.network
      : failure === 'NOT_FOUND'
        ? t.projects.errors.notFound
        : failure === 'NOT_PERMITTED'
          ? t.projects.errors.notPermitted
          : failure === 'NO_COMPANY'
            ? t.projects.errors.noCompany
            : failure === 'ALREADY_STARTED'
              ? t.projects.errors.alreadyStarted
              : failure === 'TARGET_BEFORE_START'
                ? t.projects.errors.targetBeforeStart
                : failure === 'OVERRUN_CEILING_EXCEEDED'
                  ? t.projects.errors.overrunCeiling
                  : t.projects.errors.unknown;

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const saved = await save(messages);
    if (saved !== null) navigate('/projects');
  };

  // A project that could not be loaded shows the failure alone: there is no form to fill in.
  const unreachable = editing && failure === 'NOT_FOUND';

  return (
    <div className="app">
      <AppNav name={`${firstName} ${lastName}`.trim()} initials={initialsOf(firstName, lastName)} />

      <main className="profile">
        <header className="profile__head">
          <div className="profile__head-text">
            <h1 className="profile__title">
              {editing ? t.projects.form.editTitle : t.projects.form.createTitle}
            </h1>
            <p className="profile__sub">
              {editing ? t.projects.form.editLede : t.projects.form.createLede}
            </p>
          </div>
          <Link to="/projects" className="btn btn--ghost btn--sm">{t.projects.backToList}</Link>
        </header>

        {failure !== null ? (
          <section className="panel"><FormAlert message={failureMessage} /></section>
        ) : null}

        {loading ? (
          <section className="panel">
            <p className="panel__lede" role="status">{t.projects.loading}</p>
          </section>
        ) : null}

        {!loading && !unreachable ? (
          <form className="panel" onSubmit={(e) => void onSubmit(e)} noValidate>
            <TextField
              id="name"
              label={t.projects.form.name.label}
              placeholder={t.projects.form.name.placeholder}
              value={values.name}
              onChange={(v) => set('name', v)}
              required
              {...(errors.name ? { error: errors.name, touched: true } : {})}
            />

            <SelectField
              id="projectType"
              label={t.projects.type.label}
              placeholder={t.projects.type.placeholder}
              value={values.projectType}
              onChange={(v) => set('projectType', v as typeof values.projectType)}
              required
              options={PROJECT_TYPES.map((code) => ({ value: code, label: t.projects.type[code] }))}
              {...(errors.projectType ? { error: errors.projectType, touched: true } : {})}
            />

            {/* Free text appears only for `other`, and is sent only then. */}
            {values.projectType === 'other' ? (
              <TextField
                id="projectTypeOther"
                label={t.projects.type.otherLabel}
                placeholder={t.projects.type.otherPlaceholder}
                value={values.projectTypeOther}
                onChange={(v) => set('projectTypeOther', v)}
                required
                {...(errors.projectTypeOther ? { error: errors.projectTypeOther, touched: true } : {})}
              />
            ) : null}

            <TextField
              id="size"
              label={t.projects.size.label}
              placeholder={t.projects.size.placeholder}
              hint={t.projects.size.hint}
              value={values.size}
              onChange={(v) => set('size', v)}
              required
              {...(errors.size ? { error: errors.size, touched: true } : {})}
            />

            <div className="form-group">
              <label className="field-label" htmlFor="description">
                {t.projects.form.description.label}
              </label>
              <textarea
                id="description"
                className="form-input form-input--area"
                rows={3}
                dir="auto"
                placeholder={t.projects.form.description.placeholder}
                value={values.description}
                onChange={(e) => set('description', e.target.value)}
              />
            </div>

            <LocationField
              label={t.projects.form.location.label}
              placeholder={t.projects.form.location.placeholder}
              place={values.place}
              city={values.city}
              onPlace={(place) => set('place', place)}
              onCity={(city) => set('city', city)}
            />

            <TextField
              id="address"
              label={t.projects.form.address.label}
              placeholder={t.projects.form.address.placeholder}
              value={values.address}
              onChange={(v) => set('address', v)}
            />

            <div className="project-dates">
              <TextField
                id="startDate"
                type="date"
                label={t.projects.form.startDate.label}
                value={values.startDate}
                onChange={(v) => set('startDate', v)}
                required
                {...(errors.startDate ? { error: errors.startDate, touched: true } : {})}
              />
              <TextField
                id="targetEndDate"
                type="date"
                label={t.projects.form.targetEndDate.label}
                value={values.targetEndDate}
                onChange={(v) => set('targetEndDate', v)}
                required
                {...(errors.targetEndDate ? { error: errors.targetEndDate, touched: true } : {})}
              />
            </div>

            {/* `x` is set once. On Edit it is stated as a fact, never offered as a control. */}
            {editing && project !== null ? (
              <p className="project-allowance" role="note">
                {t.projects.form.overrunAllowance.locked
                  .replace('{days}', String(project.dates.overrunAllowanceDays))
                  .replace('{date}', project.dates.overrunCeilingDate)}
              </p>
            ) : (
              <TextField
                id="overrunAllowanceDays"
                type="number"
                label={t.projects.form.overrunAllowance.label}
                hint={t.projects.form.overrunAllowance.hint}
                value={values.overrunAllowanceDays}
                onChange={(v) => set('overrunAllowanceDays', v)}
                required
                {...(errors.overrunAllowanceDays ? { error: errors.overrunAllowanceDays, touched: true } : {})}
              />
            )}

            {!editing ? (
              <p className="project-allowance" role="note">{t.projects.calendar.inheritedOnCreate}</p>
            ) : null}

            <div className="project-form__actions">
              <button type="submit" className="btn btn--primary" disabled={saving}>
                {t.projects.form.save}
                {saving ? <ButtonSpinner /> : null}
              </button>
              <Link to="/projects" className="btn btn--ghost">{t.projects.form.cancel}</Link>
            </div>
          </form>
        ) : null}

        {!loading && editing && project !== null ? (
          <ProjectCalendarPanel
            project={project}
            outdated={outdatedCalendar}
            busy={saving}
            canManage={project.viewerManages}
            onAdopt={(keep) => void adoptCalendar(keep)}
          />
        ) : null}

        {/* Cancellation exists only on Edit, and only while the server says it is available. */}
        {!loading && editing && project?.cancellable === true ? (
          <section className="panel panel--danger" aria-labelledby="cancel-project-title">
            <h2 id="cancel-project-title" className="panel__title">{t.projects.form.deleteProject}</h2>
            <p className="panel__lede">{t.projects.form.deleteConfirm}</p>

            {confirmingCancel ? (
              <div className="project-form__actions">
                <button
                  type="button"
                  className="btn btn--danger"
                  disabled={saving}
                  onClick={() => void cancel().then((done) => { if (done) navigate('/projects'); })}
                >
                  {t.projects.form.deleteConfirmAction}
                  {saving ? <ButtonSpinner /> : null}
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setConfirmingCancel(false)}>
                  {t.projects.form.deleteDismiss}
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setConfirmingCancel(true)}>
                {t.projects.form.deleteProject}
              </button>
            )}
          </section>
        ) : null}
      </main>
    </div>
  );
};
