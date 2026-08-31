import { useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { AuthShell } from '../../components/AuthShell';
import { FormAlert } from '../../components/FormAlert';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { useGoogleAuth } from '../../auth/useGoogleAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { RegisterForm } from './RegisterForm';
import { useRegisterForm, type GoogleRegistration } from './useRegisterForm';
import registerCss from './register.css?inline';
import placeCss from '../../location/place.css?inline';

/**
 * The Register screen: the brand panel, the card, and the form.
 *
 * **Creating an account does not sign anyone in.** The approved flow is
 * `Register → Login → Personal dashboard`, and Login is the authentication boundary, so a
 * successful registration navigates to Login and stores nothing. The success panel this screen
 * used to end on is gone with the behaviour it described — it told the person they were already
 * signed in, which the flow no longer makes true.
 *
 * `replace` keeps Register out of the history stack: pressing Back from Login should not return
 * to a filled-in signup form for an account that now exists.
 */
export const RegisterPage = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();
  useScreenStylesheet(
    { id: 'register.css', css: registerCss },
    { id: 'place.css', css: placeCss },
  );
  useDocumentTitle('יצירת חשבון / Create account — FieldSync');

  const onSuccess = useCallback((): void => {
    navigate('/login', { replace: true });
  }, [navigate]);

  /**
   * Set by Login when Google verified somebody who has no FieldSync account yet. It carries the
   * identity and the credential, and nothing about their trade or their business: those are this
   * screen's own questions and are still asked.
   */
  const google = (location.state as { google?: GoogleRegistration } | null)?.google ?? null;

  const form = useRegisterForm(onSuccess, google);
  const googleAuth = useGoogleAuth();

  return (
    <AuthShell brand={t.brand}>
      <header className="form-header">
        <h2 className="form-title">{t.form.title}</h2>
        <p className="form-subtitle">{t.form.subtitle}</p>
      </header>

      {google === null ? null : (
        <p className="form-note form-note--google">
          {t.form.googleOnboarding.notice.replace('{email}', google.email)}
        </p>
      )}

      <RegisterForm form={form} />

      {/* Absent once Google has already identified this person: they are finishing that signup,
          not starting a second one. */}
      {google !== null ? null : (
        <>
          <div className="divider" aria-hidden="true">
            <span className="divider__line" />
            <span className="divider__label">{t.form.dividerOr}</span>
            <span className="divider__line" />
          </div>

          {googleAuth.error === null ? null : <FormAlert message={googleAuth.error} />}

          <GoogleSignInButton
            onCredential={googleAuth.submit}
            text="signup_with"
            disabled={googleAuth.busy}
          />
        </>
      )}

      <p className="form-footer">
        {t.form.haveAccount}{' '}
        <Link to="/login" className="form-link form-link--strong">{t.form.signIn}</Link>
      </p>

      <p className="secure-note" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="11" width="16" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        {t.form.secureNote}
      </p>
    </AuthShell>
  );
};
