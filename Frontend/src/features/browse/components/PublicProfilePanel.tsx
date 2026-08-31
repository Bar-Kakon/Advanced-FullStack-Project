import { useEffect, useState } from 'react';

import { useLanguage } from '../../../i18n/useLanguage';
import { ReportDialog } from '../../reports/ReportDialog';
import { ProfileAvatar } from '../../profile/components/ProfileAvatar';
import { initialsOf } from '../../profile/profileModel';
import { WorkPhoto } from '../../profile/components/WorkPhoto';
import type { PublicProfile } from '../../../api/browse.types';

/** One component for whichever contractor is selected. Changing selection re-renders this. */
export const PublicProfilePanel = ({
  profile,
  loading,
  notFound,
  onClose,
}: {
  profile: PublicProfile | null;
  loading: boolean;
  notFound: boolean;
  onClose: () => void;
}) => {
  const { t } = useLanguage();
  const [reporting, setReporting] = useState(false);

  // Selecting a different contractor must not carry an open report form across to them.
  useEffect(() => setReporting(false), [profile?.userId]);

  const facts = profile === null ? [] : [
    ...(profile.city ? [{ term: t.browse.profile.city, value: profile.city, auto: true }] : []),
    ...(profile.region ? [{ term: t.browse.profile.region, value: t.regions[profile.region], auto: false }] : []),
    ...(profile.travelRadiusKm !== null
      ? [{ term: t.browse.profile.travelRadius, value: `${profile.travelRadiusKm} ${t.browse.advanced.km}`, auto: false }]
      : []),
  ];

  return (
    <section className="profile-panel" aria-label={t.browse.profile.close}>
      <div className="profile-panel__head">
        {profile ? (
          <div className="pp-identity">
            <ProfileAvatar
              avatarUrl={profile.avatarUrl}
              initials={initialsOf(profile.firstName, profile.lastName)}
            />
            <div className="pp-identity__text">
              <h2 className="profile-panel__title" dir="auto">
                {`${profile.firstName} ${profile.lastName}`.trim()}
              </h2>
              {profile.companyName ? (
                <p className="profile-panel__company" dir="auto">{profile.companyName}</p>
              ) : null}
              {profile.companyPosition ? (
                <p className="pp-identity__position">{t.companyPositions[profile.companyPosition]}</p>
              ) : null}
            </div>
          </div>
        ) : (
          <h2 className="profile-panel__title">{t.browse.profile.loading}</h2>
        )}

        <button type="button" className="adv-panel__close" onClick={onClose}>
          {t.browse.profile.close}
        </button>
      </div>

      {loading ? <p className="panel__lede">{t.browse.profile.loading}</p> : null}
      {notFound ? <p className="notice notice--warn">{t.browse.profile.notFound}</p> : null}

      {profile && !loading ? (
        <div className="profile-panel__body">
          <div className="pp-signals">
            {profile.availability ? (
              <span className={`avail avail--${profile.availability}`}>
                <span className="avail__dot" aria-hidden="true" />
                {t.availability[profile.availability]}
              </span>
            ) : null}
            <span className="pp-signals__rating">
              {profile.rating
                ? `★ ${profile.rating.average.toFixed(1)} · ${t.browse.card.ratingCount.replace('{count}', String(profile.rating.count))}`
                : t.browse.profile.noRatings}
            </span>
          </div>

          {profile.specialties.length > 0 ? (
            <ul className="tags">
              <li className={`tag tag--route tag--route-${profile.registrationCategory}`}>
                {t.specialtyCategories[profile.registrationCategory]}
              </li>
              {profile.specialties.map((code) => (
                <li key={code} className="tag">{t.specialties[code]}</li>
              ))}
            </ul>
          ) : null}

          {profile.bio ? (
            <section className="pp-block">
              <h3 className="pp-block__title">{t.browse.profile.about}</h3>
              <p className="pp-block__text" dir="auto">{profile.bio}</p>
            </section>
          ) : null}

          {facts.length > 0 ? (
            <section className="pp-block">
              <h3 className="pp-block__title">{t.browse.profile.details}</h3>
              <dl className="pp-facts">
                {facts.map((fact) => (
                  <div key={fact.term} className="pp-facts__row">
                    <dt>{fact.term}</dt>
                    <dd {...(fact.auto ? { dir: 'auto' as const } : {})}>{fact.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <section className="pp-block">
            <h3 className="pp-block__title">{t.browse.profile.approvedPlaces}</h3>
            {profile.approvedTravelLocations.length === 0 ? (
              <p className="pp-block__text">{t.browse.profile.noApprovedPlaces}</p>
            ) : (
              <ul className="tags">
                {profile.approvedTravelLocations.map((place) => (
                  <li key={place.placeId} className="tag" dir="auto">{place.displayName}</li>
                ))}
              </ul>
            )}
          </section>

          <section className="pp-block">
            <h3 className="pp-block__title">{t.browse.profile.phones}</h3>
            {profile.phones.officePhone || profile.phones.businessPhone ? (
              <dl className="pp-facts">
                {profile.phones.officePhone ? (
                  <div className="pp-facts__row">
                    <dt>{t.browse.profile.officePhone}</dt>
                    <dd dir="ltr">{profile.phones.officePhone}</dd>
                  </div>
                ) : null}
                {profile.phones.businessPhone ? (
                  <div className="pp-facts__row">
                    <dt>{t.browse.profile.businessPhone}</dt>
                    <dd dir="ltr">{profile.phones.businessPhone}</dd>
                  </div>
                ) : null}
              </dl>
            ) : (
              <p className="pp-block__text">{t.browse.profile.phonesHidden}</p>
            )}
          </section>

          <section className="pp-block">
            <h3 className="pp-block__title">{t.browse.profile.work}</h3>
            {profile.work.length === 0 ? (
              <p className="pp-block__text">{t.browse.profile.noWork}</p>
            ) : (
              <ul className="pp-work">
                {profile.work.map((entry) => (
                  <li key={entry.id} className="pp-work__item">
                    <WorkPhoto url={entry.imageUrl} title={entry.title} variant="row" />
                    <div className="pp-work__text">
                      <p className="pp-work__title" dir="auto">{entry.title}</p>
                      <p className="pp-work__meta" dir="auto">{entry.meta}</p>
                      {entry.onFieldSync ? (
                        <span className="work-badge">{t.browse.profile.badge}</span>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Absent rather than disabled: the server decides whether a rating may be given. */}
          {profile.rateable.canRate ? (
            <button type="button" className="btn btn--primary btn--sm">{t.browse.profile.rate}</button>
          ) : (
            <p className="pp-foot">
              {profile.isSelf ? t.browse.profile.cannotRateSelf : t.browse.profile.cannotRateYet}
            </p>
          )}

          {/* Absent on your own profile, because self-reporting is refused by the server anyway. */}
          {profile.isSelf ? null : reporting ? (
            <ReportDialog
              subjectUserId={profile.userId}
              subjectName={`${profile.firstName} ${profile.lastName}`.trim()}
              onClose={() => setReporting(false)}
            />
          ) : (
            <button
              type="button"
              className="btn btn--ghost btn--sm pp-report"
              onClick={() => setReporting(true)}
            >
              {t.reports.trigger}
            </button>
          )}
        </div>
      ) : null}
    </section>
  );
};