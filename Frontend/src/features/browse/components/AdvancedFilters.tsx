import { useLanguage } from '../../../i18n/useLanguage';
import type { BrowseState } from '../useBrowse';
import { PlaceAutocomplete } from '../../../location/PlaceAutocomplete';

/** The bounds the server enforces on `maxDrivingKm`. */
const MIN_KM = 1;
const MAX_KM = 500;
const STARS = [5, 4, 3, 2, 1];

/**
 * A real layout column, not a drawer or an overlay. It reflows the grid and the results stay
 * visible and usable beside it.
 */
export const AdvancedFilters = ({ state, onClose }: { state: BrowseState; onClose: () => void }) => {
  const { t } = useLanguage();
  const { filters, applyFilters } = state;

  return (
    <section className="adv-panel" id="browse-advanced" aria-label={t.browse.advanced.title}>
      <div className="adv-panel__head">
        <h3 className="adv-panel__title">{t.browse.advanced.title}</h3>
        <button type="button" className="adv-panel__close" onClick={onClose}>
          {t.browse.filters.advancedClose}
        </button>
      </div>

      <div className="adv-panel__body">
        <div className="adv-group">
          <h4 className="adv-group__title">{t.browse.advanced.placeTitle}</h4>
          <p className="adv-group__lede">{t.browse.advanced.placeLede}</p>
          <PlaceAutocomplete
            label={t.browse.advanced.placeLabel}
            value={filters.approvedPlace}
            onChange={(place) => applyFilters({ approvedPlace: place })}
          />
        </div>

        <div className="adv-group">
          <h4 className="adv-group__title">{t.browse.advanced.distanceTitle}</h4>
          <p className="adv-group__lede">{t.browse.advanced.distanceLede}</p>
          <PlaceAutocomplete
            label={t.browse.advanced.originLabel}
            value={filters.origin}
            onChange={(place) => applyFilters({ origin: place })}
          />

          {/* Any whole number the server accepts, not a list of presets. */}
          <div className="form-group">
            <label className="field-label" htmlFor="browse-km">{t.browse.advanced.maxKmLabel}</label>
            <div className="unit-field">
              <input
                id="browse-km"
                className="form-input form-input--num"
                type="number"
                dir="ltr"
                inputMode="numeric"
                min={MIN_KM}
                max={MAX_KM}
                step={1}
                value={filters.maxDrivingKm ?? ''}
                onChange={(e) =>
                  applyFilters({ maxDrivingKm: e.target.value === '' ? null : Number(e.target.value) })
                }
              />
              <span className="unit-field__unit">{t.browse.advanced.km}</span>
            </div>
            <p className="field-hint">{t.browse.advanced.maxKmHint}</p>
          </div>
        </div>

        <div className="adv-group">
          <h4 className="adv-group__title">{t.browse.advanced.ratingTitle}</h4>
          <p className="adv-group__lede">{t.browse.advanced.ratingLede}</p>

          {/* Reversed in CSS, so the row reads five stars down to one however the page is mirrored. */}
          <fieldset className="star-select" aria-label={t.browse.advanced.ratingTitle}>
            {STARS.map((score) => (
              <span key={score} className="star-select__pair">
                <input
                  type="radio"
                  name="minRating"
                  id={`min-rating-${score}`}
                  value={score}
                  checked={filters.minRating === score}
                  onChange={() => applyFilters({ minRating: score })}
                />
                <label htmlFor={`min-rating-${score}`} title={String(score)}>★</label>
              </span>
            ))}
          </fieldset>

          <p className="field-hint">{t.browse.advanced.ratingHint}</p>

          {filters.minRating !== null ? (
            <button
              type="button"
              className="btn btn--quiet btn--sm"
              onClick={() => applyFilters({ minRating: null })}
            >
              {t.browse.advanced.ratingClear}
            </button>
          ) : null}
        </div>
      </div>
    </section>
  );
};
