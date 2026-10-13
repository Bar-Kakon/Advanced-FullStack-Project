import { useCallback, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { classifyAccountRecoveryError, restoreAccount } from '../../api/auth.api';
import { AuthShell } from '../../components/AuthShell';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { FormAlert } from '../../components/FormAlert';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import loginCss from '../login/login.css?inline';
import resetCss from '../password-reset/password-reset.css?inline';

/**
 * Self-service D8 recovery, step two: the link's landing. Restoring takes an explicit press — a
 * mail scanner that prefetches the URL must not restore anything — and success deliberately does
 * NOT sign the person in: the restored account authenticates afresh, like any other.
 */
export const RestoreAccountPage = () => {
  const { t } = useLanguage();
  useScreenStylesheet(
    { id: 'login.css', css: loginCss },
    { id: 'password-reset.css', css: resetCss },
  );
  useDocumentTitle('שחזור חשבון / Restore Account — Blokta');

  const copy = t.accountRecovery;
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') ?? '';

  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<'invalid' | 'expired' | 'network' | 'generic' | null>(
    token === '' ? 'invalid' : null,
  );

  const restore = useCallback(async (): Promise<void> => {
    if (busy || token === '') return;
    setBusy(true);
    setFailure(null);
    try {
      await restoreAccount({ token });
      setDone(true);
    } catch (error) {
      const code = classifyAccountRecoveryError(error);
      setFailure(
        code === 'INVALID' ? 'invalid'
        : code === 'EXPIRED' ? 'expired'
        : code === 'NETWORK' ? 'network'
        : 'generic',
      );
    } finally {
      setBusy(false);
    }
  }, [busy, token]);

  const failureMessage =
    failure === 'invalid' ? (token === '' ? copy.missingToken : copy.errors.invalid)
    : failure === 'expired' ? copy.errors.expired
    : failure === 'network' ? copy.errors.network
    : failure === 'generic' ? copy.errors.generic
    : null;

  return (
    <AuthShell brand={t.forgotPassword.brand}>
      {done ? (
        <section className="auth-step auth-step--current auth-step--center" aria-label={copy.successTitle}>
          <span className="status-badge status-badge--solid" aria-hidden="true">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 13l4 4 10-10" />
            </svg>
          </span>
          <header className="form-header">
            <h2 className="form-title">{copy.successTitle}</h2>
            <p className="form-subtitle">{copy.successSubtitle}</p>
          </header>
          <Link to="/login" className="btn btn--primary btn--full">{copy.toLogin}</Link>
        </section>
      ) : (
        <section className="auth-step auth-step--current auth-step--center" aria-label={copy.confirmTitle}>
          <header className="form-header">
            <h2 className="form-title">{copy.confirmTitle}</h2>
            <p className="form-subtitle">{copy.confirmSubtitle}</p>
          </header>

          {failureMessage === null ? null : <FormAlert message={failureMessage} />}

          {failure === 'invalid' || failure === 'expired' ? (
            <Link to={failure === 'invalid' ? '/recover-account' : '/login'} className="btn btn--primary btn--full">
              {failure === 'invalid' ? copy.title : copy.backToSignIn}
            </Link>
          ) : (
            <button
              type="button"
              className="btn btn--primary btn--full"
              disabled={busy || token === ''}
              aria-busy={busy}
              onClick={() => void restore()}
            >
              {copy.confirmAction}
              {busy ? <ButtonSpinner /> : null}
            </button>
          )}

          <p className="form-footer">
            <Link to="/login" className="form-link form-link--strong">{copy.backToSignIn}</Link>
          </p>
        </section>
      )}
    </AuthShell>
  );
};
