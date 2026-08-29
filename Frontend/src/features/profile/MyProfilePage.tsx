import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { AppNav } from '../../components/AppNav';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { CompletedWorkPanel } from './components/CompletedWorkPanel';
import { RatingsPanel } from './components/RatingsPanel';
import { TrustPanel } from './components/TrustPanel';
import { initialsOf } from './profileModel';
import { useMyProfile } from './useMyProfile';
import profileCss from './profile.css?inline';
import myProfileCss from './my-profile.css?inline';

/** One read-only row. `value` is `null` where the person has not supplied that detail. */
const Fact = ({ label, value, dir }: { label: string; value: ReactNode; dir?: 'ltr' | 'auto' }) => {
  const { t } = useLanguage();
  const missing = value === null;

  return (
    <div className="fact">
      <dt className="field-label">{label}</dt>
      <dd className={`fact__value${missing ? ' fact__value--empty' : ''}`} {...(dir ? { dir } : {})}>
        {missing ? t.profile.details.notProvided : value}
      </dd>
    </div>
  );
};

/** A number with its unit, or nothing at all. A missing value is never rendered as a zero. */
const Measure = ({ value, unit }: { value: number | null; unit: string }): ReactNode =>
  value === null ? null : (
    <>
      <bdi>{value}</bdi>
      <span className="fact__unit">{unit}</span>
    </>
  );

/**
 * My profile — the read view. No inputs, no form, no validation, no Save: every change goes
 * through the one global Edit control, which is what keeps a single editing surface rather than a
 * per-field pencil on every row.
 *
 * **Phone display follows D15 as closed.** The personal / login number is never shown, anywhere —
 * it is not in the shape this screen reads. What a profile shows is the email plus the office
 * phone and the business phone, each of which may be absent on its own: they live on two different
 * documents (`companies.officePhone` and `users.businessPhone`) and neither is a fallback for the
 * other, so a missing one is reported as missing rather than filled in from the other.
 */
export const MyProfilePage = () => {
  const { t } = useLanguage();
  const { profile, loading, failure, reload } = useMyProfile();
  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'my-profile.css', css: myProfileCss },
  );
  useDocumentTitle('הפרופיל שלי / My profile — FieldSync');

  const fullName = profile ? `${profile.firstName} ${profile.lastName}`.trim() : '';
  const initials = profile ? initialsOf(profile.firstName, profile.lastName) : '';

  if (loading || profile === null) {
    return (
      <div className="app">
        <AppNav name={fullName} initials={initials} />
        <main className="profile">
          {failure ? (
            <div className="notice notice--warn" role="alert">
              <span>
                {failure === 'NETWORK' ? t.profile.errors.network : t.profile.errors.generic}
              </span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={reload}>
                {t.profile.errors.retry}
              </button>
            </div>
          ) : (
            <p className="panel__lede">{t.profile.loading}</p>
          )}
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <AppNav name={fullName} initials={initials} />

      <main className="profile">
        <header className="profile__head">
          <div className="profile__head-text">
            <h1 className="profile__title">{t.profile.title}</h1>
            <p className="profile__sub">{t.profile.lede}</p>
          </div>

          {/* The pencil is filled with the button colour so the two tools read as one mark. */}
          <Link to="/profile/edit" className="btn btn--edit" aria-label={t.profile.edit} title={t.profile.edit}>
            <svg className="btn__icon" width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M19.6 3.4a4 4 0 0 0-5.4 5.2L5.6 17.2a1.8 1.8 0 0 0 2.5 2.5l8.6-8.6a4 4 0 0 0 5.2-5.4l-2.4 2.4-2.2-.6-.6-2.2z" />
              <path className="icon-pencil" d="M3.5 6.4 6.4 3.5 18.8 15.9 21.5 21.5 15.9 18.8z" />
              <path d="M5.6 8.5 8.5 5.6" />
            </svg>
          </Link>
        </header>

        <TrustPanel
          profile={profile}
          initials={initials}
          availabilityLabel={profile.availability === null ? null : t.availability[profile.availability]}
          explain={
            <details className="explain trust__explain">
              <summary className="explain__q">{t.profile.explain.question}</summary>
              <div className="explain__a">
                <p>{t.profile.explain.answerOne}</p>
                <p>{t.profile.explain.answerTwo}</p>
              </div>
            </details>
          }
        />

        {/* One grid, so every gap between major sections is the same 22px */}
        <div className="profile-grid">
          <div className="profile-grid__col">
            <section className="panel" aria-labelledby="about-title">
              <h2 id="about-title" className="panel__title">{t.profile.about}</h2>
              {profile.bio ? (
                <p className="bio-text" dir="auto">{profile.bio}</p>
              ) : (
                <p className="panel__lede">{t.profile.details.notProvided}</p>
              )}
            </section>

            <CompletedWorkPanel entries={profile.work} lede={t.profile.work.lede} />
          </div>

          <div className="profile-grid__col">
            <section className="panel" aria-labelledby="details-title">
              <h2 id="details-title" className="panel__title">{t.profile.details.title}</h2>

              <dl className="facts">
                <Fact label={t.profile.details.companyName} value={profile.companyName} dir="auto" />
                <Fact label={t.profile.details.email} value={profile.email || null} dir="ltr" />
                {/* Two independent numbers, on two different documents, with no fallback between
                    them in either direction. Each is reported empty on its own terms. */}
                <Fact label={t.profile.details.officePhone} value={profile.officePhone || null} dir="ltr" />
                <Fact label={t.profile.details.businessPhone} value={profile.businessPhone || null} dir="ltr" />
                {/* A chosen place names itself; an account that only ever typed a city shows that. */}
                <Fact
                  label={t.profile.details.city}
                  value={profile.place?.displayName ?? (profile.city || null)}
                  dir="auto"
                />
                <Fact
                  label={t.profile.details.region}
                  value={profile.region === null ? null : t.regions[profile.region]}
                />
                <Fact
                  label={t.profile.details.travel}
                  value={<Measure value={profile.travelRadiusKm} unit={t.profile.details.km} />}
                />
              </dl>
            </section>

            <section className="panel" aria-labelledby="sched-title">
              <h2 id="sched-title" className="panel__title">{t.profile.scheduling.title}</h2>
              <p className="panel__lede">{t.profile.scheduling.lede}</p>

              <dl className="facts">
                <Fact
                  label={t.profile.scheduling.delay}
                  value={<Measure value={profile.delayToleranceDays} unit={t.profile.scheduling.days} />}
                />
                <Fact
                  label={t.profile.scheduling.notice}
                  value={<Measure value={profile.noticeRequiredDays} unit={t.profile.scheduling.days} />}
                />
              </dl>
            </section>
          </div>
        </div>

        <RatingsPanel
          ratings={profile.ratings}
          lede={t.profile.ratings.lede.replace('{count}', String(profile.ratings.length))}
        />
      </main>
    </div>
  );
};
