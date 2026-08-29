import { useState } from 'react';
import { Link } from 'react-router-dom';

import { AuthShell } from '../../components/AuthShell';
import { TextField } from '../../components/TextField';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { EMAIL_PATTERN } from '../../shared/validation';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import loginCss from '../login/login.css?inline';
import resetCss from './password-reset.css?inline';

/**
 * Forgot password — the request step and the confirmation that follows it.
 *
 * The confirmation is the screen's whole security posture and it is unchanged: it says *if* an
 * account exists, never that one does, so the form cannot be used to find out who is registered.
 * The brand panel states the same rule twice on purpose, because a person who sees the identical
 * answer for a typo and for their real address should be told why.
 *
 * **No request is sent, because there is nothing to send it to.** The API mounts `/auth/register`,
 * `/auth/login` and `/auth/refresh` and nothing else: there is no forgot-password endpoint, no
 * reset token, and no mail transport or provider anywhere in the backend. Rather than post to an
 * address that does not exist — which would mean inventing the contract — the screen advances to
 * the same confirmation the prototype advanced to, and says plainly that no message was sent. The
 * step it advances to, and the copy on it, are exactly the approved ones.
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
  useDocumentTitle('שחזור סיסמה / Reset Password — FieldSync');

  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [sent, setSent] = useState(false);

  const invalid = email.length > 0 && !EMAIL_PATTERN.test(email.trim());
  const canSubmit = EMAIL_PATTERN.test(email.trim());

  return (
    <AuthShell brand={t.forgotPassword.brand}>
      {sent ? (
        <section className="auth-step auth-step--current auth-step--center" aria-label={t.forgotPassword.sentTitle}>
          <span className="status-badge" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2.5" />
              <path d="M3.5 7l8.5 6 8.5-6" />
            </svg>
          </span>

          <header className="form-header">
            <h2 className="form-title">{t.forgotPassword.sentTitle}</h2>
            <p className="form-subtitle">{t.forgotPassword.sentSubtitle}</p>
          </header>

          <Link to="/login" className="btn btn--primary btn--full">{t.forgotPassword.backButton}</Link>

          <p className="form-footer">
            {t.forgotPassword.noMail}{' '}
            {/* Resend has the same nowhere to go as the request itself. */}
            <button type="button" className="form-link form-link--strong" onClick={() => setSent(true)}>
              {t.forgotPassword.resend}
            </button>
          </p>

          <p className="form-hint" role="status">{t.forgotPassword.noEndpoint}</p>
        </section>
      ) : (
        <section className="auth-step auth-step--current" aria-label={t.forgotPassword.title}>
          <BackLink label={t.forgotPassword.backToSignIn} />

          <header className="form-header">
            <h2 className="form-title">{t.forgotPassword.title}</h2>
            <p className="form-subtitle">{t.forgotPassword.subtitle}</p>
          </header>

          <form
            className="reset-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) setSent(true);
            }}
          >
            <TextField
              id="email" label={t.forgotPassword.email.label} type="email" dir="ltr"
              placeholder={t.forgotPassword.email.placeholder} autoComplete="email" maxLength={254} required
              value={email} onChange={setEmail} onBlur={() => setTouched(true)} touched={touched}
              {...(invalid ? { error: t.forgotPassword.email.error } : {})}
            />

            <button type="submit" className="btn btn--primary btn--full btn--advance" disabled={!canSubmit}>
              {t.forgotPassword.submit}
            </button>
          </form>

          <p className="form-footer">
            {t.forgotPassword.remembered}{' '}
            <Link to="/login" className="form-link form-link--strong">{t.forgotPassword.signIn}</Link>
          </p>
        </section>
      )}
    </AuthShell>
  );
};
