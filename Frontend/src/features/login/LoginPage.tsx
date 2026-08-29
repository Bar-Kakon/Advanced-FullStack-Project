import { useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import type { LoginResponse } from '../../api/types';
import { AuthShell } from '../../components/AuthShell';
import { destinationFor } from '../../auth/destination';
import { useAuth } from '../../auth/useAuth';
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

      {/* Google sign-in is still a stub: no provider has been configured. */}
      <button type="button" className="btn btn--google btn--full">
        <svg className="google-icon" width="18" height="18" viewBox="0 0 18 18"
             xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#4285F4" />
          <path d="M9 18c2.43 0 4.467-.806 5.956-2.184l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853" />
          <path d="M3.964 10.706A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.706V4.962H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.038l3.007-2.332z" fill="#FBBC05" />
          <path d="M9 3.58c1.62 0 3.06.56 4.21 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.962L3.964 7.294C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335" />
        </svg>
        {t.login.google}
      </button>

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
