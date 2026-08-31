import { useCallback, useEffect, useRef, useState } from 'react';

import { AppNav } from '../../components/AppNav';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { initialsOf } from '../profile/profileModel';
import {
  classifyBrowseError,
  fetchPublicProfile,
  isAbortError,
  requestConnection,
} from '../../api/browse.api';
import { BROWSE_SORTS, type BrowseSort, type PublicProfile } from '../../api/browse.types';
import { AdvancedFilters } from './components/AdvancedFilters';
import { ContractorCard } from './components/ContractorCard';
import { FilterRail } from './components/FilterRail';
import { PublicProfilePanel } from './components/PublicProfilePanel';
import { TravelPreferences } from './components/TravelPreferences';
import { useBrowse } from './useBrowse';
import profileCss from '../profile/profile.css?inline';
import editProfileCss from '../profile/edit-profile.css?inline';
import browseCss from './browse.css?inline';
import placeCss from '../../location/place.css?inline';

export const BrowsePage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const state = useBrowse();

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileMissing, setProfileMissing] = useState(false);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [travelOpen, setTravelOpen] = useState(false);

  const profileRequest = useRef<AbortController | null>(null);

  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'edit-profile.css', css: editProfileCss },
    { id: 'browse.css', css: browseCss },
    { id: 'place.css', css: placeCss },
  );
  useDocumentTitle('עיון בקבלנים / Browse contractors — Blokta');

  useEffect(() => {
    if (selectedId === null) {
      setProfile(null);
      return;
    }

    profileRequest.current?.abort();
    const controller = new AbortController();
    profileRequest.current = controller;

    setProfileLoading(true);
    setProfileMissing(false);

    void (async () => {
      try {
        setProfile(await fetchPublicProfile(selectedId, controller.signal));
      } catch (error) {
        if (isAbortError(error)) return;
        setProfile(null);
        setProfileMissing(classifyBrowseError(error) === 'NOT_FOUND');
      } finally {
        if (!controller.signal.aborted) setProfileLoading(false);
      }
    })();

    return () => controller.abort();
  }, [selectedId]);

  const connect = useCallback(
    async (userId: string): Promise<void> => {
      if (connecting) return;
      setConnecting(userId);
      try {
        await requestConnection(userId);
        state.retry();
      } finally {
        setConnecting(null);
      }
    },
    [connecting, state],
  );

  const firstName = user?.firstName ?? '';
  const message =
    state.failure === 'NETWORK' ? t.browse.errors.network
    : state.failure === 'LOCATION_SERVICE_UNAVAILABLE' ? t.browse.errors.locationUnavailable
    : state.failure === 'LOCATION_SERVICE_NOT_CONFIGURED' ? t.browse.errors.locationNotConfigured
    : state.failure === 'INVALID_PLACE_ID' ? t.browse.errors.invalidPlace
    : state.failure ? t.browse.errors.generic
    : null;

  const bodyClass = [
    'browse__body',
    advancedOpen ? 'has-advanced' : '',
    selectedId ? 'has-profile' : '',
  ].filter(Boolean).join(' ');

  return (
    <div className="app">
      <AppNav name={`${firstName} ${user?.lastName ?? ''}`.trim()}
        initials={initialsOf(firstName, user?.lastName ?? '')} />

      <main className="browse">
        <header className="browse__head">
          <div className="browse__heading">
            <h1 className="browse__title">{t.browse.title}</h1>
            <p className="browse__sub">{t.browse.lede}</p>
          </div>
          <div className="browse__head-actions">
            {/* The order the earlier screen approved, minus the two the product cannot compute. */}
            <div className="browse__sort">
              <label className="field-label" htmlFor="browse-sort">{t.browse.sort.label}</label>
              <div className="select-wrap">
                <select
                  id="browse-sort"
                  className="form-select"
                  value={state.filters.sort}
                  onChange={(e) => state.applyFilters({ sort: e.target.value as BrowseSort })}
                >
                  {BROWSE_SORTS.map((code) => (
                    <option key={code} value={code}>{t.browse.sort[code]}</option>
                  ))}
                </select>
                <span className="select-chevron" aria-hidden="true">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                       strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9l6 6 6-6" /></svg>
                </span>
              </div>
            </div>

            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setTravelOpen(true)}>
              {t.browse.travel.openEditor}
            </button>
          </div>
        </header>

        <div className={bodyClass}>
          <FilterRail
            state={state}
            advancedOpen={advancedOpen}
            onToggleAdvanced={() => setAdvancedOpen((open) => !open)}
          />

          {advancedOpen ? (
            <AdvancedFilters state={state} onClose={() => setAdvancedOpen(false)} />
          ) : null}

          <section className="results" aria-label={t.browse.title} aria-busy={state.loading}>
            {message ? (
              <div className="notice notice--warn" role="alert">
                <span>{message}</span>
                <button type="button" className="btn btn--ghost btn--sm" onClick={state.retry}>
                  {t.browse.errors.retry}
                </button>
              </div>
            ) : null}

            {state.degraded && !message ? (
              <p className="notice notice--warn" role="status">{t.browse.advanced.degraded}</p>
            ) : null}

            {state.loading && !state.loaded ? (
              <p className="panel__lede">{t.browse.loading}</p>
            ) : state.contractors.length === 0 && !message ? (
              <p className="panel__lede">
                {state.filters.minRating === null
                  ? t.browse.empty
                  : t.browse.emptyByRating.replace('{stars}', String(state.filters.minRating))}
              </p>
            ) : (
              <>
                <p className="results__count">
                  {t.browse.resultsCount.replace('{count}', String(state.contractors.length))}
                </p>

                <div className="card-grid">
                  {state.contractors.map((contractor) => (
                    <ContractorCard
                      key={contractor.userId}
                      contractor={contractor}
                      selected={contractor.userId === selectedId}
                      onView={() => setSelectedId(contractor.userId)}
                      onConnect={() => void connect(contractor.userId)}
                      connecting={connecting === contractor.userId}
                    />
                  ))}
                </div>

                {state.hasMore ? (
                  <button
                    type="button"
                    className="btn btn--ghost results__more"
                    onClick={state.loadMore}
                    disabled={state.loadingMore}
                    aria-busy={state.loadingMore}
                  >
                    {t.browse.loadMore}
                    {state.loadingMore ? <ButtonSpinner /> : null}
                  </button>
                ) : null}
              </>
            )}
          </section>

          {selectedId ? (
            <PublicProfilePanel
              profile={profile}
              loading={profileLoading}
              notFound={profileMissing}
              onClose={() => setSelectedId(null)}
            />
          ) : null}
        </div>
      </main>

      {travelOpen ? <TravelPreferences onClose={() => setTravelOpen(false)} /> : null}
    </div>
  );
};