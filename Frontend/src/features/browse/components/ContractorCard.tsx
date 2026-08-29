import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { useLanguage } from '../../../i18n/useLanguage';
import type { ContractorSummary } from '../../../api/browse.types';

const initials = (first: string, last: string): string =>
  `${first.charAt(0)}${last.charAt(0)}`.toUpperCase();

/**
 * One card. The four relationship states share one visual treatment and differ only by wording and
 * icon; availability keeps its own approved colours because it is a different status system.
 */
export const ContractorCard = ({
  contractor,
  selected,
  onView,
  onConnect,
  connecting,
}: {
  contractor: ContractorSummary;
  selected: boolean;
  onView: () => void;
  onConnect: () => void;
  connecting: boolean;
}) => {
  const { t } = useLanguage();
  const name = `${contractor.firstName} ${contractor.lastName}`.trim();

  return (
    <article className={`c-card${selected ? ' is-selected' : ''}`}>
      <div className="c-card__head">
        <span className="avatar" aria-hidden="true">
          {initials(contractor.firstName, contractor.lastName)}
        </span>
        <div className="c-card__id">
          <h3 className="c-card__name" dir="auto">{name}</h3>
          {contractor.companyName ? (
            <p className="c-card__company" dir="auto">{contractor.companyName}</p>
          ) : null}
        </div>
      </div>

      {contractor.availability ? (
        <p className={`avail avail--${contractor.availability}`}>
          <span className="avail__dot" aria-hidden="true" />
          {t.availability[contractor.availability]}
        </p>
      ) : null}

      <ul className="tags">
        {contractor.specialties.map((code) => (
          <li key={code} className="tag">{t.trades[code]}</li>
        ))}
      </ul>

      <p className="c-card__meta">
        {contractor.city ? <span dir="auto">{contractor.city}</span> : null}
        {contractor.region ? <span>{t.regions[contractor.region]}</span> : null}
        {contractor.drivingDistanceMeters !== null ? (
          <span>
            {t.browse.card.drivingDistance.replace(
              '{km}',
              String(Math.round(contractor.drivingDistanceMeters / 1000)),
            )}
          </span>
        ) : null}
      </p>

      <p className="c-card__signals">
        <span>
          {contractor.rating
            ? `★ ${contractor.rating.average.toFixed(1)} · ${t.browse.card.ratingCount.replace('{count}', String(contractor.rating.count))}`
            : t.browse.card.noRating}
        </span>
        <span>{t.browse.card.noFlexibility}</span>
      </p>

      {contractor.relationship !== 'none' ? (
        <p className="rel-badge">
          <span className="rel-badge__icon" aria-hidden="true">
            {contractor.relationship === 'connected' ? '✓' : '⋯'}
          </span>
          {contractor.relationship === 'connected' ? t.browse.card.connected : null}
          {contractor.relationship === 'outgoing_request' ? t.browse.card.pendingOutgoing : null}
          {contractor.relationship === 'incoming_request' ? t.browse.card.pendingIncoming : null}
        </p>
      ) : null}

      <div className="c-card__actions">
        <button type="button" className="btn btn--ghost btn--sm" onClick={onView}>
          {t.browse.card.viewProfile}
        </button>

        {contractor.relationship === 'none' ? (
          <button
            type="button"
            className="btn btn--primary btn--sm"
            onClick={onConnect}
            disabled={connecting}
            aria-busy={connecting}
          >
            {t.browse.card.connect}
            {connecting ? <ButtonSpinner /> : null}
          </button>
        ) : null}

        {/* Disabled rather than linked: My network is not migrated, as in the navbar. */}
        {contractor.relationship === 'outgoing_request' || contractor.relationship === 'incoming_request' ? (
          <button type="button" className="btn btn--quiet btn--sm" disabled aria-disabled="true">
            {t.browse.card.manageInNetwork}
          </button>
        ) : null}
      </div>
    </article>
  );
};
