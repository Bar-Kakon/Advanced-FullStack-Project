import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { FormAlert } from '../../components/FormAlert';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import { useSettings } from './useSettings';
import type { SettingsLanguage } from '../../api/settings.types';
import profileCss from '../profile/profile.css?inline';
import settingsCss from './settings.css?inline';

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

/**
 * Account settings, grouped by what each section actually owns and saved one section at a time.
 *
 * Nothing here is a dead control. Where a plan does not carry a capability the section says so in
 * words instead of drawing a switch the server would ignore, and the account-closure section
 * states the closed 60-day rule and why the request cannot be raised yet.
 */
export const SettingsPage = () => {
  const { t, setLang } = useLanguage();
  const { user } = useAuth();
  const {
    settings, loading, busy, savedSection, failure,
    setLanguage, setNotifications, setContactVisibility, unmuteProject,
  } = useSettings();

  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'settings.css', css: settingsCss },
  );
  useDocumentTitle(t.settings.documentTitle);

  const [digestHour, setDigestHour] = useState(18);
  useEffect(() => {
    if (settings?.notifications.digestHour !== null && settings?.notifications.digestHour !== undefined) {
      setDigestHour(settings.notifications.digestHour);
    }
  }, [settings?.notifications.digestHour]);

  const name = `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim();
  const entitlements = settings?.entitlements;
  const planCode = (entitlements?.planCode ?? 'free') as 'free' | 'basic' | 'premium';

  /** The interface follows the account, so the stored preference and what is on screen agree. */
  const changeLanguage = (language: SettingsLanguage): void => {
    setLang(language);
    void setLanguage(language);
  };

  const savedIn = (section: string) =>
    savedSection === section ? <span className="settings-saved">{t.settings.saved}</span> : null;

  return (
    <>
      <AppNav name={name} initials={initialsOf(user?.firstName ?? '', user?.lastName ?? '')} />

      <main className="profile-main">
        <header className="profile-header">
          <h1 className="profile-title">{t.settings.title}</h1>
          <p className="profile-lede">{t.settings.lede}</p>
        </header>

        {failure === null ? null : (
          <FormAlert message={failure === 'network'
              ? t.settings.errors.network
              : failure === 'load'
                ? t.settings.errors.load
                : t.settings.errors.save} />
        )}

        {loading || settings === null ? (
          <p className="settings-empty">{t.settings.loading}</p>
        ) : (
          <div className="settings-sections">
            <section className="settings-section" aria-labelledby="settings-language">
              <h2 className="settings-section__title" id="settings-language">
                {t.settings.language.title}
              </h2>
              <p className="settings-section__note">{t.settings.language.note}</p>

              <div className="settings-row">
                <div className="form-group">
                  <label className="form-label" htmlFor="settings-lang-select">
                    {t.settings.language.title}
                  </label>
                  <select
                    id="settings-lang-select"
                    className="form-input"
                    value={settings.language}
                    onChange={(event) => changeLanguage(event.target.value as SettingsLanguage)}
                  >
                    <option value="he">{t.settings.language.hebrew}</option>
                    <option value="en">{t.settings.language.english}</option>
                  </select>
                </div>
                {savedIn('language')}
              </div>
            </section>

            <section className="settings-section" aria-labelledby="settings-notifications">
              <h2 className="settings-section__title" id="settings-notifications">
                {t.settings.notifications.title}
              </h2>
              <p className="settings-section__note">{t.settings.notifications.inAppNote}</p>
              <p className="settings-section__note">{t.settings.notifications.graceNote}</p>

              <label className="settings-choice">
                <input
                  type="checkbox"
                  checked={settings.notifications.operationalEmail}
                  onChange={(event) =>
                    void setNotifications({ operationalEmail: event.target.checked })
                  }
                />
                <span className="settings-choice__label">
                  {t.settings.notifications.operationalEmail}
                  <span className="settings-choice__hint">
                    {t.settings.notifications.operationalEmailNote}
                  </span>
                  <span className="settings-choice__hint">
                    {t.settings.notifications.notMarketing}
                  </span>
                </span>
              </label>

              <p className="settings-section__note">
                {entitlements?.notificationDigest === true
                  ? t.settings.notifications.digestOnBasic
                  : t.settings.notifications.digestNotIncluded}
              </p>

              {entitlements?.notificationTimingControls === true ? (
                <>
                  <h3 className="settings-section__title">{t.settings.notifications.timingTitle}</h3>
                  <p className="settings-section__note">{t.settings.notifications.timingNote}</p>
                  <div className="settings-row">
                    <div className="form-group">
                      <label className="form-label" htmlFor="settings-digest-hour">
                        {t.settings.notifications.digestHour}
                      </label>
                      <select
                        id="settings-digest-hour"
                        className="form-input"
                        value={digestHour}
                        onChange={(event) => setDigestHour(Number(event.target.value))}
                      >
                        {HOURS.map((hour) => (
                          <option key={hour} value={hour}>
                            {String(hour).padStart(2, '0')}:00
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      className="btn btn--primary"
                      disabled={busy === 'notifications'}
                      onClick={() => void setNotifications({ digestHour })}
                    >
                      {t.settings.notifications.save}
                      {busy === 'notifications' ? <ButtonSpinner /> : null}
                    </button>
                    {savedIn('notifications')}
                  </div>
                </>
              ) : (
                <p className="settings-locked">{t.settings.notifications.timingNotIncluded}</p>
              )}
            </section>

            <section className="settings-section" aria-labelledby="settings-contact">
              <h2 className="settings-section__title" id="settings-contact">
                {t.settings.contact.title}
              </h2>
              <p className="settings-section__note">{t.settings.contact.note}</p>
              <p className="settings-section__note">{t.settings.contact.automaticNote}</p>
              <p className="settings-section__note">{t.settings.contact.connectionNote}</p>

              {(
                [
                  ['email', t.settings.contact.email],
                  ['businessPhone', t.settings.contact.businessPhone],
                  ['officePhone', t.settings.contact.officePhone],
                ] as const
              ).map(([field, label]) => (
                <label className="settings-choice" key={field}>
                  <input
                    type="checkbox"
                    checked={settings.contactVisibility[field]}
                    onChange={(event) =>
                      void setContactVisibility({ [field]: event.target.checked })
                    }
                  />
                  <span className="settings-choice__label">{label}</span>
                </label>
              ))}
              {savedIn('contact')}
            </section>

            <section className="settings-section" aria-labelledby="settings-mutes">
              <h2 className="settings-section__title" id="settings-mutes">
                {t.settings.mutes.title}
              </h2>
              <p className="settings-section__note">{t.settings.mutes.note}</p>

              {settings.mutedProjects.length === 0 ? (
                <p className="settings-empty">{t.settings.mutes.empty}</p>
              ) : (
                <ul className="settings-mutes">
                  {settings.mutedProjects.map((project) => (
                    <li className="settings-mute" key={project.projectId}>
                      <span className="settings-mute__name" dir="auto">{project.name}</span>
                      <button
                        type="button"
                        className="btn btn--ghost"
                        disabled={busy === 'mutes'}
                        onClick={() => void unmuteProject(project.projectId)}
                      >
                        {t.settings.mutes.unmute}
                        {busy === 'mutes' ? <ButtonSpinner /> : null}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="settings-section" aria-labelledby="settings-plan">
              <h2 className="settings-section__title" id="settings-plan">
                {t.settings.plan.title}
              </h2>
              <p className="settings-section__note">{t.settings.plan.note}</p>
              <div className="settings-plan">
                <span className="settings-plan__badge">
                  {t.settings.plan.current}: {t.settings.plan.codes[planCode]}
                </span>
                <Link to="/subscriptions" className="btn btn--ghost">
                  {t.settings.plan.link}
                </Link>
              </div>
            </section>

            <section className="settings-section" aria-labelledby="settings-account">
              <h2 className="settings-section__title" id="settings-account">
                {t.settings.account.title}
              </h2>
              <h3 className="settings-section__title">{t.settings.account.deactivationTitle}</h3>
              <p className="settings-section__note">{t.settings.account.deactivationNote}</p>
              {/* Stated rather than drawn as a disabled control: the lifecycle is closed but how
                  active commitments are handled is not, so there is nothing here to press yet. */}
              <p className="settings-locked">{t.settings.account.deactivationPending}</p>
            </section>
          </div>
        )}
      </main>
    </>
  );
};
