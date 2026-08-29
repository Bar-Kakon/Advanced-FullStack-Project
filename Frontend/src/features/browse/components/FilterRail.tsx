import { AVAILABILITY_STATUSES, REGIONS, TRADES } from '../../../api/types';
import type { Availability, Region, Trade } from '../../../api/types';
import { useLanguage } from '../../../i18n/useLanguage';
import type { BrowseState } from '../useBrowse';

/** The Basic rail. Pinned in the layout by design — never a drawer, modal or overlay. */
export const FilterRail = ({
  state,
  advancedOpen,
  onToggleAdvanced,
}: {
  state: BrowseState;
  advancedOpen: boolean;
  onToggleAdvanced: () => void;
}) => {
  const { t } = useLanguage();
  const { filters, applyFilters } = state;

  const one = <T extends string>(list: readonly T[]): T | '' => list[0] ?? '';

  return (
    <aside className="filters" aria-label={t.browse.filters.title}>
      <div className="filters__card">
        <div className="filters__head">
          <h2 className="filters__title">{t.browse.filters.title}</h2>
          <button type="button" className="filters__clear" onClick={state.clearFilters}>
            {t.browse.clear}
          </button>
        </div>

        <div className="filters__form">
          <div className="form-group">
            <label className="field-label" htmlFor="browse-q">{t.browse.filters.search.label}</label>
            <input
              id="browse-q"
              className="form-input"
              type="search"
              dir="auto"
              placeholder={t.browse.filters.search.placeholder}
              value={filters.q}
              onChange={(e) => applyFilters({ q: e.target.value })}
            />
          </div>

          <div className="form-group">
            <label className="field-label" htmlFor="browse-specialty">{t.browse.filters.specialty.label}</label>
            <select
              id="browse-specialty"
              className="form-select"
              value={one(filters.specialties)}
              onChange={(e) =>
                applyFilters({ specialties: e.target.value ? [e.target.value as Trade] : [] })
              }
            >
              <option value="">{t.browse.filters.specialty.placeholder}</option>
              {TRADES.map((code) => (
                <option key={code} value={code}>{t.trades[code]}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="field-label" htmlFor="browse-region">{t.browse.filters.region.label}</label>
            <select
              id="browse-region"
              className="form-select"
              value={one(filters.regions)}
              onChange={(e) =>
                applyFilters({ regions: e.target.value ? [e.target.value as Region] : [] })
              }
            >
              <option value="">{t.browse.filters.region.placeholder}</option>
              {REGIONS.map((code) => (
                <option key={code} value={code}>{t.regions[code]}</option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="field-label" htmlFor="browse-availability">{t.browse.filters.availability.label}</label>
            <select
              id="browse-availability"
              className="form-select"
              value={one(filters.availability)}
              onChange={(e) =>
                applyFilters({ availability: e.target.value ? [e.target.value as Availability] : [] })
              }
            >
              <option value="">{t.browse.filters.availability.placeholder}</option>
              {AVAILABILITY_STATUSES.map((code) => (
                <option key={code} value={code}>{t.availability[code]}</option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="btn btn--ghost btn--sm adv-trigger"
            onClick={onToggleAdvanced}
            aria-expanded={advancedOpen}
            aria-controls="browse-advanced"
          >
            {advancedOpen ? t.browse.filters.advancedClose : t.browse.filters.advanced}
          </button>
        </div>
      </div>
    </aside>
  );
};
