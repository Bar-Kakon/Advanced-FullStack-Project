import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import {
  classifyEmailChangeConfirmError,
  confirmEmailChange,
  fetchCurrentUser,
  type EmailChangeConfirmFailure,
} from '../../api/auth.api';
import { useAuth } from '../../auth/useAuth';
import { AuthShell } from '../../components/AuthShell';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { FormAlert } from '../../components/FormAlert';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import loginCss from '../login/login.css?inline';
import resetCss from '../password-reset/password-reset.css?inline';

export const ConfirmEmailChangePage = () => {
  const { t } = useLanguage();
  const copy = t.confirmEmailChange;
  const [params] = useSearchParams();
  const { isAuthenticated, setUser } = useAuth();
  useScreenStylesheet(
    { id: 'login.css', css: loginCss },
    { id: 'password-reset.css', css: resetCss },
  );
  useDocumentTitle(copy.documentTitle);

  const token = params.get('token') ?? '';
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<EmailChangeConfirmFailure | null>(null);

  const confirm = async (): Promise<void> => {
    if (busy || token.length === 0) return;
    setBusy(true);
    setFailure(null);
    try {
      await confirmEmailChange(token);
      setDone(true);
      if (isAuthenticated) await fetchCurrentUser().then(setUser).catch(() => undefined);
    } catch (error) {
      setFailure(classifyEmailChangeConfirmError(error));
    } finally {
      setBusy(false);
    }
  };

  const failureMessage =
    failure === 'INVALID' ? copy.invalid
    : failure === 'TOO_MANY' ? copy.tooManyRequests
    : failure === 'NETWORK' ? copy.network
    : failure !== null ? copy.generic
    : null;

  const finished = done || token.length === 0 || failure === 'INVALID';

  return (
    <AuthShell brand={copy.brand}>
      <section className="auth-step auth-step--current" aria-label={copy.title}>
        <header className="form-header">
          <h2 className="form-title" id="confirm-email-title">{done ? copy.doneTitle : copy.title}</h2>
          <p className="form-subtitle">
            {done ? copy.doneBody : token.length === 0 ? copy.missingToken : copy.lede}
          </p>
        </header>

        {failureMessage === null ? null : <FormAlert message={failureMessage} />}

        {finished ? (
          <Link
            to={isAuthenticated ? '/settings' : '/login'}
            className="btn btn--primary btn--full"
            id="confirm-email-onward"
          >
            {isAuthenticated ? copy.toSettings : copy.toLogin}
          </Link>
        ) : (
          <button
            type="button"
            id="confirm-email-change"
            className="btn btn--primary btn--full"
            disabled={busy}
            aria-busy={busy}
            onClick={() => void confirm()}
          >
            {copy.submit}
            {busy ? <ButtonSpinner /> : null}
          </button>
        )}
      </section>
    </AuthShell>
  );
};
