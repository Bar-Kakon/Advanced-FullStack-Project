import { useCallback, useEffect, useState } from 'react';

import { AppNav } from '../../components/AppNav';
import { FormAlert } from '../../components/FormAlert';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { classifyBrowseError, fetchPublicProfile, isAbortError } from '../../api/browse.api';
import type { PublicProfile } from '../../api/browse.types';
import { NETWORK_TABS, type NetworkTab } from '../../api/network.types';
import { initialsOf } from '../profile/profileModel';
import { PublicProfilePanel } from '../browse/components/PublicProfilePanel';
import { NetworkRow } from './components/NetworkRow';
import { useMyNetwork } from './useMyNetwork';
import profileCss from '../profile/profile.css?inline';
import browseCss from '../browse/browse.css?inline';
import networkCss from './network.css?inline';

export const MyNetworkPage = () => {
  const { t } = useLanguage();
  const { user } = useAuth();
  const [tab, setTab] = useState<NetworkTab>('connected');

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileNotFound, setProfileNotFound] = useState(false);

  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'browse.css', css: browseCss },
    { id: 'network.css', css: networkCss },
  );
  useDocumentTitle('הרשת שלי / My network — FieldSync');

  const { rows, loading, loadingMore, failure, pendingUserId, hasMore, reload, loadMore, act } =
    useMyNetwork(tab);

  // Closing the panel when the tab changes stops a profile outliving the list it was opened from.
  useEffect(() => {
    setProfile(null);
    setProfileNotFound(false);
  }, [tab]);

  const viewProfile = useCallback(async (userId: string): Promise<void> => {
    setProfileLoading(true);
    setProfileNotFound(false);
    try {
      setProfile(await fetchPublicProfile(userId));
    } catch (error) {
      if (isAbortError(error)) return;
      setProfile(null);
      setProfileNotFound(classifyBrowseError(error) === 'NOT_FOUND');
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const firstName = user?.firstName ?? '';
  const lastName = user?.lastName ?? '';

  return (
    <div className="app">
      <AppNav name={`${firstName} ${lastName}`.trim()} initials={initialsOf(firstName, lastName)} />

      <main className="profile">
        <header className="profile__head">
          <div className="profile__head-text">
            <h1 className="profile__title">{t.network.title}</h1>
            <p className="profile__sub">{t.network.lede}</p>
          </div>
        </header>

        <div className="net-tabs" role="tablist" aria-label={t.network.title}>
          {NETWORK_TABS.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={tab === name}
              className={`net-tab ${tab === name ? 'net-tab--active' : ''}`}
              onClick={() => setTab(name)}
            >
              {t.network.tabs[name]}
            </button>
          ))}
        </div>

        <div className={`net-layout ${profile || profileLoading || profileNotFound ? 'net-layout--with-panel' : ''}`}>
          <section className="panel" aria-live="polite">
            {failure !== null ? (
              <>
                <FormAlert
                  message={
                    failure === 'NETWORK'
                      ? t.network.errors.network
                      : failure === 'STALE'
                        ? t.network.errors.stale
                        : t.network.errors.unknown
                  }
                />
                <button type="button" className="btn btn--ghost btn--sm" onClick={() => void reload()}>
                  {t.network.retry}
                </button>
              </>
            ) : null}

            {loading ? <p className="panel__lede" role="status">{t.network.loading}</p> : null}

            {!loading && rows !== null && rows.length === 0 ? (
              <p className="panel__lede">{t.network.empty[tab]}</p>
            ) : null}

            {!loading && rows !== null && rows.length > 0 ? (
              <ul className="net-list">
                {rows.map((row) => (
                  <NetworkRow
                    key={row.person.userId}
                    row={row}
                    tab={tab}
                    pending={pendingUserId === row.person.userId}
                    onAct={(action, userId) => void act(action, userId)}
                    onViewProfile={(userId) => void viewProfile(userId)}
                  />
                ))}
              </ul>
            ) : null}

            {hasMore ? (
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                disabled={loadingMore}
                onClick={() => void loadMore()}
              >
                {t.network.loadMore}
              </button>
            ) : null}
          </section>

          {profile || profileLoading || profileNotFound ? (
            <PublicProfilePanel
              profile={profile}
              loading={profileLoading}
              notFound={profileNotFound}
              onClose={() => {
                setProfile(null);
                setProfileNotFound(false);
              }}
            />
          ) : null}
        </div>
      </main>
    </div>
  );
};
