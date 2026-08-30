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
import { FullAuthorityDialog } from './components/FullAuthorityDialog';
import { usePermissions } from './usePermissions';
import type { Grant, ProjectPermission } from '../../api/permissions.types';
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

  const [confirming, setConfirming] = useState<string | null>(null);
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

  const togglePermission = (grant: Grant, permission: ProjectPermission) => {
    const next = grant.permissions.includes(permission)
      ? grant.permissions.filter((p) => p !== permission)
      : [...grant.permissions, permission];
    void setPermissions(grant.id, next);
  };

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
                    <li key={grant.id} className="perm-grant">
                      <div className="perm-grant__head">
                        <span className="perm-grant__role">{t.permissions.roles[grant.projectRole]}</span>
                        {grant.userId === user?.id ? (
                          <span className="perm-chip">{t.permissions.grants.you}</span>
                        ) : null}
                        {grant.status === 'removed' ? (
                          <span className="perm-chip perm-chip--off">{t.permissions.grants.revoked}</span>
                        ) : null}
                        {grant.fullAuthority ? (
                          <span className="perm-chip perm-chip--full">{t.permissions.fullAuthority.granted}</span>
                        ) : null}
                      </div>

                      {/* Individual permissions are hidden under full authority: it already covers
                          them, and showing a half-ticked list would misdescribe what is granted. */}
                      {grant.fullAuthority ? null : (
                        <ul className="perm-checks">
                          {overview.allPermissions.map((permission) => (
                            <li key={permission}>
                              <label className="perm-check">
                                <input
                                  type="checkbox"
                                  checked={grant.permissions.includes(permission)}
                                  disabled={busyId !== null || grant.status === 'removed'}
                                  onChange={() => togglePermission(grant, permission)}
                                />
                                <span>{t.permissions.perms[permission]}</span>
                              </label>
                            </li>
                          ))}
                        </ul>
                      )}

                      {/* Your own row offers neither action: the server refuses both, and a
                          control that always fails is worse than no control. */}
                      {grant.status === 'removed' || grant.userId === user?.id ? null : (
                        <div className="perm-grant__actions">
                          {grant.fullAuthority ? (
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              disabled={busyId !== null}
                              onClick={() => void setFullAuthority(grant.id, false)}
                            >
                              {t.permissions.fullAuthority.reduce}
                              {busyId === grant.id ? <ButtonSpinner /> : null}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="btn btn--ghost btn--sm"
                              disabled={busyId !== null}
                              onClick={() => setConfirming(grant.id)}
                            >
                              {t.permissions.fullAuthority.label}
                            </button>
                          )}

                          <button
                            type="button"
                            className="btn btn--quiet btn--sm"
                            disabled={busyId !== null}
                            onClick={() => void revoke(grant.id)}
                          >
                            {t.permissions.grants.revoke}
                          </button>
                        </div>
                      )}

                      {confirming === grant.id ? (
                        <FullAuthorityDialog
                          busy={busyId === grant.id}
                          onConfirm={() => {
                            setConfirming(null);
                            void setFullAuthority(grant.id, true);
                          }}
                          onDismiss={() => setConfirming(null)}
                        />
                      ) : null}
                    </li>
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
