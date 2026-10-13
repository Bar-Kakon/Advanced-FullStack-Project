import { useCallback, useState } from 'react';
import { Link } from 'react-router-dom';

import { classifyAccountRecoveryError, requestAccountRecovery } from '../../api/auth.api';
import { AuthShell } from '../../components/AuthShell';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { FormAlert } from '../../components/FormAlert';
import { TextField } from '../../components/TextField';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import { EMAIL_PATTERN } from '../../shared/validation';
import loginCss from '../login/login.css?inline';
import resetCss from '../password-reset/password-reset.css?inline';

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

/**
 * Self-service D8 recovery, step one: ask for the link. The confirmation deliberately says *if* a
 * matching account exists — the server answers identically for every address, and this screen's
 * wording is that same posture.
 */
export const RecoverAccountPage = () => {
  const { t } = useLanguage();
  useScreenStylesheet(
    { id: 'login.css', css: loginCss },
    { id: 'password-reset.css', css: resetCss },
  );
  useDocumentTitle('שחזור חשבון / Restore Account — Blokta');

  const copy = t.accountRecovery;
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState<'network' | 'generic' | null>(null);

  const invalid = email.length > 0 && !EMAIL_PATTERN.test(email.trim());
  const canSubmit = EMAIL_PATTERN.test(email.trim());

  const send = useCallback(async (): Promise<void> => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setFailed(null);
    try {
      await requestAccountRecovery({ email: email.trim() });
      setSent(true);
    } catch (error) {
      setFailed(classifyAccountRecoveryError(error) === 'NETWORK' ? 'network' : 'generic');
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, submitting, email]);

  if (sent) {
    return (
      <AuthShell brand={t.forgotPassword.brand}>
        <section className="auth-step auth-step--current auth-step--center" aria-label={copy.sentTitle}>
          <span className="status-badge" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="5" width="18" height="14" rx="2.5" />
              <path d="M3.5 7l8.5 6 8.5-6" />
            </svg>
          </span>
          <header className="form-header">
            <h2 className="form-title">{copy.sentTitle}</h2>
            <p className="form-subtitle">{copy.sentSubtitle}</p>
          </header>
          <p className="form-hint">{copy.privacyNote}</p>
          <Link to="/login" className="btn btn--primary btn--full">{copy.backToSignIn}</Link>
        </section>
      </AuthShell>
    );
  }

  return (
    <AuthShell brand={t.forgotPassword.brand}>
      <section className="auth-step auth-step--current" aria-label={copy.title}>
        <BackLink label={copy.backToSignIn} />

        <header className="form-header">
          <h2 className="form-title">{copy.title}</h2>
          <p className="form-subtitle">{copy.subtitle}</p>
        </header>

        {failed === null ? null : (
          <FormAlert message={failed === 'network' ? copy.errors.network : copy.errors.generic} />
        )}

        <form
          className="login-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void send();
          }}
        >
          <TextField
            id="email" label={copy.email.label} type="email" dir="ltr" withWarning
            placeholder={copy.email.placeholder} autoComplete="email" maxLength={254} required
            value={email} onChange={setEmail}
            onBlur={() => setTouched(true)} touched={touched}
            {...(invalid || (touched && email.trim() === '') ? { error: copy.email.error } : {})}
          />

          <button
            type="submit"
            className="btn btn--primary btn--full"
            disabled={!canSubmit || submitting}
            aria-busy={submitting}
          >
            {copy.submit}
            {submitting ? <ButtonSpinner /> : null}
          </button>
        </form>
      </section>
    </AuthShell>
  );
};
