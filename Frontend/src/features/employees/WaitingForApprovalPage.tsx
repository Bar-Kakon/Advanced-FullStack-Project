import { useCallback, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { isAxiosError } from 'axios';

import { fetchCurrentUser } from '../../api/auth.api';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { LanguageSwitch } from '../../components/LanguageSwitch';
import { destinationFor, isAwaitingApproval } from '../../auth/destination';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import profileCss from '../profile/profile.css?inline';
import employeesCss from './employees.css?inline';

/**
 * Where an authenticated employee waits. They keep their tokens, their session and their account;
 * the only thing they lack is an active relationship, and no internal term is named on screen.
 */
export const WaitingForApprovalPage = () => {
  const { t } = useLanguage();
  const { user, setUser, signOut } = useAuth();
  const navigate = useNavigate();
  const [checking, setChecking] = useState(false);
  const [stillWaiting, setStillWaiting] = useState(false);
  const [failure, setFailure] = useState<'NETWORK' | 'UNKNOWN' | null>(null);
  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'employees.css', css: employeesCss },
  );
  useDocumentTitle('ההרשמה הושלמה / Registration complete — Blokta');

  const check = useCallback(async (): Promise<void> => {
    if (checking) return;
    setChecking(true);
    setStillWaiting(false);
    setFailure(null);
    try {
      const fresh = await fetchCurrentUser();
      setUser(fresh);
      if (isAwaitingApproval(fresh)) setStillWaiting(true);
      else navigate(destinationFor(fresh), { replace: true });
    } catch (error) {
      setFailure(isAxiosError(error) && !error.response ? 'NETWORK' : 'UNKNOWN');
    } finally {
      setChecking(false);
    }
  }, [checking, setUser, navigate]);

  if (!isAwaitingApproval(user)) return <Navigate to={destinationFor(user)} replace />;

  const message =
    failure === 'NETWORK' ? t.waitingForApproval.errors.network
    : failure ? t.waitingForApproval.errors.generic
    : stillWaiting ? t.waitingForApproval.stillWaiting
    : null;

  return (
    <div className="app">
      <header className="app-nav">
        <div className="app-nav__inner">
          <span className="app-nav__name">Blokta</span>
          <LanguageSwitch />
        </div>
      </header>

      <main className="profile">
        <section className="panel waiting">
          <h1 className="profile__title">{t.waitingForApproval.heading}</h1>
          <p className="waiting__body">{t.waitingForApproval.body}</p>
          <p className="waiting__secondary">{t.waitingForApproval.secondary}</p>

          {message ? (
            <p className={`notice${failure ? ' notice--error' : ''}`} role="status" aria-live="polite">
              {message}
            </p>
          ) : null}

          <div className="waiting__actions">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void check()}
              disabled={checking}
              aria-busy={checking}
            >
              {t.waitingForApproval.checkStatus}
              {checking ? <ButtonSpinner /> : null}
            </button>

            <button type="button" className="btn btn--quiet" onClick={signOut}>
              {t.waitingForApproval.signOut}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};
