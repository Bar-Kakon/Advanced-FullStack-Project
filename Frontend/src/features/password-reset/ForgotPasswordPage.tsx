import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';

import {
  classifyForgotPasswordError,
  requestPasswordReset,
  type ForgotPasswordFailure,
} from '../../api/auth.api';
import { AuthShell } from '../../components/AuthShell';
import { FormAlert } from '../../components/FormAlert';
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
 * account exists, never that one does. That is not a client-side politeness — the server answers
 * `200 { status: 'ok' }` for a known address, an unknown one and a suspended account alike, so
 * there is nothing here to leak even if this screen wanted to.
 *
 * The only failure it can report is not reaching the server at all. A person who is told a link is
 * coming when the request never left the browser would wait for an email that was never asked for.
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
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ForgotPasswordFailure | null>(null);

  const invalid = email.length > 0 && !EMAIL_PATTERN.test(email.trim());
  const canSubmit = EMAIL_PATTERN.test(email.trim());

  const send = useCallback(async (): Promise<void> => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await requestPasswordReset({ email: email.trim() });
      setSent(true);
    } catch (error) {
      setFailure(classifyForgotPasswordError(error));
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, submitting, email]);

  const alertMessage =
    failure === 'NETWORK' ? t.forgotPassword.errors.network
    : failure ? t.forgotPassword.errors.generic
    : null;

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

          {alertMessage ? <FormAlert message={alertMessage} /> : null}

          <Link to="/login" className="btn btn--primary btn--full">{t.forgotPassword.backButton}</Link>

          <p className="form-footer">
            {t.forgotPassword.noMail}{' '}
            {/* Asking again is a real second request, and it retires the first link server-side. */}
            <button
              type="button"
              className="form-link form-link--strong"
              disabled={submitting}
              onClick={() => void send()}
            >
              {submitting ? t.forgotPassword.submitting : t.forgotPassword.resend}
            </button>
          </p>
        </section>
      ) : (
        <section className="auth-step auth-step--current" aria-label={t.forgotPassword.title}>
          <BackLink label={t.forgotPassword.backToSignIn} />

          <header className="form-header">
            <h2 className="form-title">{t.forgotPassword.title}</h2>
            <p className="form-subtitle">{t.forgotPassword.subtitle}</p>
          </header>

          {alertMessage ? <FormAlert message={alertMessage} /> : null}

          <form
            className="reset-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
          >
            <TextField
              id="email" label={t.forgotPassword.email.label} type="email" dir="ltr"
              placeholder={t.forgotPassword.email.placeholder} autoComplete="email" maxLength={254} required
              value={email} onChange={setEmail} onBlur={() => setTouched(true)} touched={touched}
              {...(invalid ? { error: t.forgotPassword.email.error } : {})}
            />

            <button
              type="submit"
              className="btn btn--primary btn--full btn--advance"
              disabled={!canSubmit || submitting}
            >
              {submitting ? t.forgotPassword.submitting : t.forgotPassword.submit}
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
