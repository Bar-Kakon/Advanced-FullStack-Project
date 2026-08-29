import { Link } from 'react-router-dom';

import { useLanguage } from '../../i18n/useLanguage';
import { RegisterForm } from './RegisterForm';
import { useRegisterForm } from './useRegisterForm';
import { BrandPanel } from '../../components/BrandPanel';
import { LanguageSwitch } from '../../components/LanguageSwitch';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { RegisterSuccess } from './components/RegisterSuccess';
import registerCss from './register.css?inline';

/**
 * The Register screen: the brand panel, the card, and whichever stage of the flow is current.
 *
 * The form state lives here rather than inside `RegisterForm` because the success view needs the
 * company name the person typed, and the server's reply does not include it. State belongs at the
 * highest point that needs it — any lower and the two halves could not share it.
 */
export const RegisterPage = () => {
  const { t } = useLanguage();
  const form = useRegisterForm();
  useScreenStylesheet({ id: 'register.css', css: registerCss });
  useDocumentTitle('יצירת חשבון / Create account — FieldSync');

  return (
    <>
      <LanguageSwitch />

      <div className="auth-layout">
        <BrandPanel content={t.brand} />

        <main className="form-panel">
          <div className="form-card">
            <div className="mobile-logo" aria-hidden="true">
              <svg width="26" height="26" viewBox="0 0 40 40" fill="none">
                <circle cx="8" cy="20" r="6" fill="rgba(35,56,77,0.15)" stroke="#23384D" strokeWidth="2" />
                <circle cx="32" cy="8" r="6" fill="rgba(35,56,77,0.15)" stroke="#23384D" strokeWidth="2" />
                <circle cx="32" cy="32" r="6" fill="rgba(35,56,77,0.15)" stroke="#23384D" strokeWidth="2" />
                <line x1="14" y1="17" x2="26" y2="11" stroke="#23384D" strokeWidth="1.5" strokeDasharray="3 2" />
                <line x1="14" y1="23" x2="26" y2="29" stroke="#23384D" strokeWidth="1.5" strokeDasharray="3 2" />
                <line x1="32" y1="14" x2="32" y2="26" stroke="#23384D" strokeWidth="1.5" strokeDasharray="3 2" />
              </svg>
              <span className="mobile-logo__name">FieldSync</span>
            </div>

            {form.result ? (
              <RegisterSuccess user={form.result.user} companyName={form.values.companyName} />
            ) : (
              <>
                <header className="form-header">
                  <h2 className="form-title">{t.form.title}</h2>
                  <p className="form-subtitle">{t.form.subtitle}</p>
                </header>

                <RegisterForm form={form} />

                <div className="divider" aria-hidden="true">
                  <span className="divider__line" />
                  <span className="divider__label">{t.form.dividerOr}</span>
                  <span className="divider__line" />
                </div>

                {/* Google sign-up is still a stub: no provider has been configured. */}
                <button type="button" className="btn btn--google btn--full">
                  <svg className="google-icon" width="18" height="18" viewBox="0 0 18 18"
                       xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                    <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
                    <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
                    <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05" />
                    <path d="M9 3.58c1.62 0 3.06.56 4.21 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
                  </svg>
                  {t.form.google}
                </button>

                <p className="form-footer">
                  {t.form.haveAccount}{' '}
                  {/* The prototype pointed at a filename; in the app Login is a route. Where a
                      *successful* registration goes is D30's `Register -> Login`, and that
                      navigation is still owed — see the migration report. */}
                  <Link to="/login" className="form-link form-link--strong">{t.form.signIn}</Link>
                </p>
              </>
            )}

            <p className="secure-note" aria-hidden="true">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="4" y="11" width="16" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              {t.form.secureNote}
            </p>
          </div>
        </main>
      </div>
    </>
  );
};
