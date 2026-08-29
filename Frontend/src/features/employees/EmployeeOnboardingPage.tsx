import { useCallback, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';

import { fetchCurrentUser } from '../../api/auth.api';
import { classifyEmployeeError, completeEmployeeSetup, type EmployeeFailure } from '../../api/employees.api';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { LanguageSwitch } from '../../components/LanguageSwitch';
import { DASHBOARD, canManageEmployees } from '../../auth/destination';
import { useAuth } from '../../auth/useAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { EmployeeManagement } from './EmployeeManagement';
import profileCss from '../profile/profile.css?inline';
import editProfileCss from '../profile/edit-profile.css?inline';
import employeesCss from './employees.css?inline';

/**
 * The optional first-time step: the same `EmployeeManagement`, between a heading and two ways on.
 * Skip and Finish are one request, because they record the same fact. Nothing is stored locally.
 */
export const EmployeeOnboardingPage = () => {
  const { t } = useLanguage();
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [saving, setSaving] = useState<'skip' | 'finish' | null>(null);
  const [failure, setFailure] = useState<EmployeeFailure | null>(null);
  useScreenStylesheet(
    { id: 'profile.css', css: profileCss },
    { id: 'edit-profile.css', css: editProfileCss },
    { id: 'employees.css', css: employeesCss },
  );
  useDocumentTitle('הוספת העובדים שלכם / Add your employees — FieldSync');

  const complete = useCallback(
    async (which: 'skip' | 'finish'): Promise<void> => {
      if (saving !== null) return;
      setSaving(which);
      setFailure(null);
      try {
        await completeEmployeeSetup();
        setUser(await fetchCurrentUser());
        navigate(DASHBOARD, { replace: true });
      } catch (error) {
        setFailure(classifyEmployeeError(error));
      } finally {
        setSaving(null);
      }
    },
    [saving, setUser, navigate],
  );

  // No step to offer: they cannot manage employees, or the company has already answered.
  if (!canManageEmployees(user) || user?.company?.employeeSetupComplete !== false) {
    return <Navigate to={DASHBOARD} replace />;
  }

  const message =
    failure === 'NOT_PERMITTED' ? t.employees.errors.notPermitted
    : failure === 'NO_COMPANY' ? t.employees.errors.noCompany
    : failure === 'UNAUTHENTICATED' ? t.employees.errors.unauthenticated
    : failure === 'NETWORK' ? t.employees.errors.network
    : failure ? t.employees.errors.generic
    : null;

  return (
    <div className="app">
      <header className="app-nav">
        <div className="app-nav__inner">
          <span className="app-nav__name">FieldSync</span>
          <LanguageSwitch />
        </div>
      </header>

      <main className="profile">
        <header className="profile__head">
          <div className="profile__head-text">
            <h1 className="profile__title">{t.employees.onboarding.title}</h1>
            <p className="profile__sub">{t.employees.onboarding.lede}</p>
          </div>
        </header>

        <EmployeeManagement />

        <section className="panel onboarding-actions">
          <p className="panel__lede">{t.employees.onboarding.note}</p>

          {message ? <p className="notice notice--error" role="alert">{message}</p> : null}

          <div className="onboarding-actions__row">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => void complete('finish')}
              disabled={saving !== null}
              aria-busy={saving === 'finish'}
            >
              {t.employees.onboarding.finish}
              {saving === 'finish' ? <ButtonSpinner /> : null}
            </button>

            <button
              type="button"
              className="btn btn--quiet"
              onClick={() => void complete('skip')}
              disabled={saving !== null}
              aria-busy={saving === 'skip'}
            >
              {t.employees.onboarding.skip}
              {saving === 'skip' ? <ButtonSpinner /> : null}
            </button>
          </div>
        </section>
      </main>
    </div>
  );
};
