import { useState } from 'react';
import { Link } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { FormAlert } from '../../components/FormAlert';
import { TextField } from '../../components/TextField';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import { GrantRow } from './components/GrantRow';
import { usePermissions } from './usePermissions';
import type { Grant } from '../../api/permissions.types';
import profileCss from '../profile/profile.css?inline';
import projectsCss from '../projects/projects.css?inline';
import permissionsCss from './permissions.css?inline';

/**
 * The central surface. It manages PROJECT-SCOPED grants across many projects from one place — the
 * same rows the per-project surface inside a Project Dashboard reads and writes. There is one
 * grants model and two views of it; only the filter differs.
 */
export const PermissionsPage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const {
    overview, loading, busyId, failure, reload,
    setFullAuthority, setPermissions, revoke, addTemplate, removeTemplate,
  } = usePermissions();

  const [templateName, setTemplateName] = useState('');

  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'projects.css', css: projectsCss },
    { id: 'permissions.css', css: permissionsCss },
  );
  useDocumentTitle('ניהול הרשאות / Permissions — FieldSync');

  const firstName = user?.firstName ?? '';
  const lastName = user?.lastName ?? '';

  const message =
    failure === 'NETWORK' ? t.permissions.errors.network
      : failure === 'NOT_PERMITTED' ? t.permissions.errors.notPermitted
        : failure === 'NAME_TAKEN' ? t.permissions.templates.nameTaken
          : failure === 'NOT_FOUND' ? t.permissions.errors.notFound
            : t.permissions.errors.unknown;

  const byProject = new Map<string, Grant[]>();
  for (const grant of overview?.grants ?? []) {
    byProject.set(grant.projectId, [...(byProject.get(grant.projectId) ?? []), grant]);
  }

  return (
    <div className="app">
      <AppNav name={`${firstName} ${lastName}`.trim()} initials={initialsOf(firstName, lastName)} />

      <main className="profile">
        <header className="profile__head">
          <div className="profile__head-text">
            <h1 className="profile__title">{t.permissions.title}</h1>
            <p className="profile__sub">{t.permissions.lede}</p>
          </div>
          <Link to="/projects" className="btn btn--ghost btn--sm">{t.permissions.backToProjects}</Link>
        </header>

        {failure !== null ? (
          <section className="panel">
            <FormAlert message={message} />
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void reload()}>
              {t.permissions.retry}
            </button>
          </section>
        ) : null}

        {loading ? (
          <section className="panel"><p className="panel__lede" role="status">{t.permissions.loading}</p></section>
        ) : null}

        {!loading && overview !== null && overview.projects.length === 0 ? (
          <section className="panel"><p className="panel__lede">{t.permissions.empty}</p></section>
        ) : null}

        {!loading && overview !== null && overview.projects.length > 0 ? (
          <section className="panel" aria-labelledby="grants-title">
            <h2 id="grants-title" className="panel__title">{t.permissions.grants.title}</h2>

            {overview.projects.map((project) => (
              <div key={project.id} className="perm-project">
                <h3 className="perm-project__name" dir="auto">{project.name}</h3>

                <ul className="perm-grants">
                  {(byProject.get(project.id) ?? []).map((grant) => (
                    <GrantRow
                      key={grant.id}
                      grant={grant}
                      viewerUserId={user?.id}
                      allPermissions={overview.allPermissions}
                      busyId={busyId}
                      onSetPermissions={(id, next) => void setPermissions(id, next)}
                      onSetFullAuthority={(id, next) => void setFullAuthority(id, next)}
                      onRevoke={(id) => void revoke(id)}
                    />
                  ))}
                </ul>
              </div>
            ))}
          </section>
        ) : null}

        {!loading && overview !== null ? (
          <section className="panel" aria-labelledby="templates-title">
            <h2 id="templates-title" className="panel__title">{t.permissions.templates.title}</h2>
            <p className="panel__lede">{t.permissions.templates.lede}</p>

            {overview.templates.length === 0 ? (
              <p className="panel__lede">{t.permissions.templates.none}</p>
            ) : (
              <ul className="perm-templates">
                {overview.templates.map((template) => (
                  <li key={template.id} className="perm-template">
                    <span className="perm-template__name" dir="auto">{template.name}</span>
                    <span className="perm-template__body">
                      {template.fullAuthority
                        ? t.permissions.fullAuthority.granted
                        : template.permissions.map((p) => t.permissions.perms[p]).join(' · ')}
                    </span>
                    <button
                      type="button"
                      className="btn btn--quiet btn--sm"
                      disabled={busyId !== null}
                      onClick={() => void removeTemplate(template.id)}
                    >
                      {t.permissions.templates.remove}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <div className="perm-template-new">
              <TextField
                id="templateName"
                label={t.permissions.templates.name}
                placeholder={t.permissions.templates.namePlaceholder}
                value={templateName}
                onChange={setTemplateName}
              />
              <button
                type="button"
                className="btn btn--primary btn--sm"
                disabled={busyId !== null || templateName.trim().length === 0}
                onClick={() => {
                  void addTemplate(templateName.trim(), [], false);
                  setTemplateName('');
                }}
              >
                {t.permissions.templates.create}
                {busyId === 'new-template' ? <ButtonSpinner /> : null}
              </button>
            </div>
          </section>
        ) : null}
      </main>
    </div>
  );
};
