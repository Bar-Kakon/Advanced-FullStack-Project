import { useLanguage } from '../../../i18n/useLanguage';
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

  return (
    <section className="profile-panel" aria-label={t.browse.profile.close}>
      <div className="profile-panel__head">
        <h2 className="profile-panel__title" dir="auto">
          {profile ? `${profile.firstName} ${profile.lastName}`.trim() : t.browse.profile.loading}
        </h2>
        <button type="button" className="adv-panel__close" onClick={onClose}>
          {t.browse.profile.close}
        </button>
      </div>

      {loading ? <p className="panel__lede">{t.browse.profile.loading}</p> : null}
      {notFound ? <p className="notice notice--warn">{t.browse.profile.notFound}</p> : null}

      {profile && !loading ? (
        <div className="profile-panel__body">
          {profile.companyName ? (
            <p className="profile-panel__company" dir="auto">{profile.companyName}</p>
          ) : null}

          {profile.availability ? (
            <p className={`avail avail--${profile.availability}`}>
              <span className="avail__dot" aria-hidden="true" />
              {t.availability[profile.availability]}
            </p>
          ) : null}

          {profile.bio ? (
            <section className="pp-block">
              <h3 className="pp-block__title">{t.browse.profile.about}</h3>
              <p className="pp-block__text" dir="auto">{profile.bio}</p>
            </section>
          ) : null}

          <section className="pp-block">
            <h3 className="pp-block__title">{t.browse.profile.details}</h3>
            <dl className="pp-facts">
              {profile.city ? (
                <>
                  <dt>{t.browse.profile.city}</dt>
                  <dd dir="auto">{profile.city}</dd>
                </>
              ) : null}
              {profile.region ? (
                <>
                  <dt>{t.browse.profile.region}</dt>
                  <dd>{t.regions[profile.region]}</dd>
                </>
              ) : null}
              {profile.companyPosition ? (
                <>
                  <dt>{t.browse.profile.position}</dt>
                  <dd>{t.companyPositions[profile.companyPosition]}</dd>
                </>
              ) : null}
              {profile.travelRadiusKm !== null ? (
                <>
                  <dt>{t.browse.profile.travelRadius}</dt>
                  <dd>{`${profile.travelRadiusKm} ${t.browse.advanced.km}`}</dd>
                </>
              ) : null}
            </dl>
          </section>

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
                  <>
                    <dt>{t.browse.profile.officePhone}</dt>
                    <dd dir="ltr">{profile.phones.officePhone}</dd>
                  </>
                ) : null}
                {profile.phones.businessPhone ? (
                  <>
                    <dt>{t.browse.profile.businessPhone}</dt>
                    <dd dir="ltr">{profile.phones.businessPhone}</dd>
                  </>
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
                    <p className="pp-work__title" dir="auto">{entry.title}</p>
                    <p className="pp-work__meta" dir="auto">{entry.meta}</p>
                    {entry.onFieldSync ? (
                      <span className="work-badge">{t.browse.profile.badge}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Absent rather than disabled: the server decides, and it currently cannot prove eligibility. */}
          {profile.isSelf ? (
            <p className="pp-block__text">{t.browse.profile.cannotRateSelf}</p>
          ) : (
            <p className="pp-block__text">{t.browse.profile.cannotRateYet}</p>
          )}
        </div>
      ) : null}
    </section>
  );
};
