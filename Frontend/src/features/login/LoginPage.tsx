import { useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import type { LoginResponse } from '../../api/types';
import { AuthShell } from '../../components/AuthShell';
import { FormAlert } from '../../components/FormAlert';
import { GoogleSignInButton } from '../../components/GoogleSignInButton';
import { destinationFor } from '../../auth/destination';
import { useAuth } from '../../auth/useAuth';
import { useGoogleAuth } from '../../auth/useGoogleAuth';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { LoginForm } from './LoginForm';
import { useLoginForm } from './useLoginForm';
import loginCss from './login.css?inline';

/**
 * The Login screen — the authentication boundary. Register creates an account; this is the only
 * place a session begins, and the Personal dashboard is what it opens onto.
 */
export const LoginPage = () => {
  const { t, setLang } = useLanguage();
  const { signIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  useScreenStylesheet({ id: 'login.css', css: loginCss });
  useDocumentTitle('כניסה / Sign In — FieldSync');

  // Set by PrivateRoute when it turned a signed-out visitor away from an address they asked for.
  const from = (location.state as { from?: string } | null)?.from;

  const onSuccess = useCallback(
    (response: LoginResponse): void => {
      signIn(response);
      // §3.4 makes `users.language` the account-level preference and localStorage the pre-login
      // default only. Login is the first moment the account preference is known, so it is applied
      // here — otherwise a contractor who chose English on the site-office desktop is back in
      // Hebrew on their phone, which is the case that rule exists for.
      setLang(response.user.language);
      navigate(from ?? destinationFor(response.user), { replace: true });
    },
    [signIn, setLang, navigate, from],
  );

  const form = useLoginForm(onSuccess);
  // Both credentials honour the address the person was originally heading for.
  const google = useGoogleAuth(from);

  return (
    <AuthShell brand={t.login.brand}>
      <header className="form-header">
        <h2 className="form-title">{t.login.title}</h2>
        <p className="form-subtitle">{t.login.subtitle}</p>
      </header>

      <LoginForm form={form} />

      <div className="divider" aria-hidden="true">
        <span className="divider__line" />
        <span className="divider__label">{t.login.dividerOr}</span>
        <span className="divider__line" />
      </div>

      {/* Above the button, so a screen reader meets the explanation before the control that
          produced it. GOOGLE_LINK_REQUIRED is the case that matters — it names what to do next. */}
      {google.error === null ? null : <FormAlert message={google.error} />}

      <GoogleSignInButton onCredential={google.submit} text="continue_with" disabled={google.busy} />

      <p className="form-footer">
        {t.login.noAccount}{' '}
        <Link to="/register" className="form-link form-link--strong">{t.login.createOne}</Link>
      </p>

      <p className="secure-note" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="4" y="11" width="16" height="9" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        {t.login.secureNote}
      </p>
    </AuthShell>
  );
};
