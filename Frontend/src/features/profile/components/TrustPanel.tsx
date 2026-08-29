import type { ReactNode } from 'react';

import { useLanguage } from '../../../i18n/useLanguage';
import type { ProfileView } from '../profileModel';
import { ProfileAvatar } from './ProfileAvatar';

/**
 * The computed signals: rating and flexibility, beside the identity. Read-only on **both**
 * profile screens — neither is something a contractor can type, which is the whole reason they
 * mean anything to the person reading them.
 *
 * The cold start renders a neutral mark and no number at all (D6, settled 2026-08-20). A zero, a
 * default or an explanatory sentence would each be a claim the platform cannot support yet.
 */

const Stars = ({ value, small = false }: { value: number; small?: boolean }) => (
  <span
    className={`rating__stars${small ? ' rating__stars--sm' : ''}`}
    style={{ '--rating': value } as React.CSSProperties}
    aria-hidden="true"
  >
    <span className="rating__fill" />
  </span>
);

const EmptyMark = ({ label }: { label: string }) => (
  <p className="state-empty">
    <span aria-hidden="true">—</span>
    <span className="sr-only">{label}</span>
  </p>
);

export const TrustPanel = ({
  profile,
  initials,
  availabilityLabel,
  explain = null,
}: {
  profile: ProfileView;
  initials: string;
  /** My profile shows the status; Edit profile lets it be chosen, so it passes `null`. */
  availabilityLabel: string | null;
  /** The flexibility explainer, present on My profile only. */
  explain?: ReactNode;
}) => {
  const { t } = useLanguage();
  const fullName = `${profile.firstName} ${profile.lastName}`.trim();
  const regionLabel = profile.region === null ? null : t.regions[profile.region];
  const place = [profile.city, regionLabel].filter(Boolean).join(' · ');

  return (
    <section className="trust" aria-labelledby="trust-title">
      <h2 id="trust-title" className="sr-only">{t.profile.summary}</h2>

      <div className="trust__identity">
        <ProfileAvatar avatarUrl={profile.avatarUrl} initials={initials} large />
        <div className="trust__id-text">
          <p className="trust__name" dir="auto">{fullName}</p>
          {/* Company name is the professional identity a contractor is found by: required at
              registration, public and searchable (D28, closed 2026-08-28). */}
          {profile.companyName ? (
            <p className="meta-row" dir="auto">{profile.companyName}</p>
          ) : null}
          <ul className="tags">
            {profile.specialties.map((code) => (
              <li className="tag" key={code}>{t.trades[code]}</li>
            ))}
          </ul>
          <p className="meta-row">
            <svg className="meta-row__pin" width="15" height="15" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span dir="auto">{place || t.profile.details.notProvided}</span>
          </p>
          {availabilityLabel !== null && profile.availability !== null ? (
            <p className={`avail avail--${profile.availability}`}>
              <span className="avail__dot" aria-hidden="true" />
              {availabilityLabel}
            </p>
          ) : null}
        </div>
      </div>

      <div className="trust__metrics">
        <div className={`metric ${profile.rating ? 'metric--score' : 'metric--pending'}`}>
          <p className="metric__label">{t.profile.rating.label}</p>
          {profile.rating ? (
            <>
              <div className="rating">
                <Stars value={profile.rating.value} />
                <span className="rating__value"><bdi>{profile.rating.value}</bdi></span>
              </div>
              <p className="metric__foot">
                {t.profile.rating.foot.replace('{count}', String(profile.rating.count))}
              </p>
            </>
          ) : (
            <EmptyMark label={t.profile.rating.empty} />
          )}
        </div>

        <div className={`metric ${profile.flexibility ? 'metric--score' : 'metric--pending'}`}>
          <p className="metric__label">{t.profile.flexibility.label}</p>
          {profile.flexibility ? (
            <>
              <div className="flex-meter">
                <div className="flex-meter__head">
                  <span className="flex-meter__value"><bdi>{profile.flexibility.score}</bdi></span>
                  <span className="flex-meter__scale"><bdi>100</bdi></span>
                </div>
                <span className="flex-meter__track" aria-hidden="true">
                  <span className="flex-meter__fill" style={{ '--score': profile.flexibility.score } as React.CSSProperties} />
                </span>
              </div>
              <p className="metric__foot metric__foot--score">
                {t.profile.flexibility.foot
                  .replace('{count}', String(profile.flexibility.responses))
                  .replace('{month}', profile.flexibility.updatedMonth)}
              </p>
            </>
          ) : (
            <EmptyMark label={t.profile.flexibility.empty} />
          )}
        </div>
      </div>

      {explain}
    </section>
  );
};

export { Stars };
