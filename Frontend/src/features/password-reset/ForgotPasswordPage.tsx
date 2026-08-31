import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';

import { requestPasswordReset } from '../../api/auth.api';
import { AuthShell } from '../../components/AuthShell';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { RequestResetForm } from './components/RequestResetForm';
import { ResetLinkSent } from './components/ResetLinkSent';
import loginCss from '../login/login.css?inline';
import resetCss from './password-reset.css?inline';

/**
 * Forgot password — ask for a link, then the confirmation.
 *
 * Both halves are shared components, because the Reset password screen shows the same two things
 * when it is opened without a usable link. One request function, one confirmation, no second flow.
 */
const BackLink = ({ label }: { label: string }) => (
  <Link to="/login" className="back-link">
    <svg className="back-link__chev" width="14" height="14" viewBox="0 0 24 24"
         fill="none" stroke="currentColor" strokeWidth="2"
         strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M15 6l-6 6 6 6" />
    </svg>
    {label}
  </Link>
);

export const ForgotPasswordPage = () => {
  const { t } = useLanguage();
  useScreenStylesheet(
    { id: 'login.css', css: loginCss },
    { id: 'password-reset.css', css: resetCss },
  );
  useDocumentTitle('שחזור סיסמה / Reset Password — Blokta');

  const [sentTo, setSentTo] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const resend = useCallback((): void => {
    if (sentTo === null || resending) return;
    setResending(true);
    void requestPasswordReset({ email: sentTo }).finally(() => setResending(false));
  }, [sentTo, resending]);

  return (
    <AuthShell brand={t.forgotPassword.brand}>
      {sentTo !== null ? (
        <ResetLinkSent onResend={resend} resending={resending} />
      ) : (
        <section className="auth-step auth-step--current" aria-label={t.forgotPassword.title}>
          <BackLink label={t.forgotPassword.backToSignIn} />

          <header className="form-header">
            <h2 className="form-title">{t.forgotPassword.title}</h2>
            <p className="form-subtitle">{t.forgotPassword.subtitle}</p>
          </header>

          <RequestResetForm submitLabel={t.forgotPassword.submit} onSent={setSentTo} />

          <p className="form-footer">
            {t.forgotPassword.remembered}{' '}
            <Link to="/login" className="form-link form-link--strong">{t.forgotPassword.signIn}</Link>
          </p>
        </section>
      )}
    </AuthShell>
  );
};
