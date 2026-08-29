import { useCallback, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import {
  classifyResetPasswordError,
  resetPassword,
  type ResetPasswordFailure,
} from '../../api/auth.api';
import { AuthShell } from '../../components/AuthShell';
import { FormAlert } from '../../components/FormAlert';
import { PasswordField } from '../../components/PasswordField';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import loginCss from '../login/login.css?inline';
import resetCss from './password-reset.css?inline';

/** The minimum Register enforces, and the minimum the reset endpoint enforces independently. */
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;

/**
 * Reset password — set a new password, then the confirmation.
 *
 * The token arrives in the query string, because that is where the emailed link puts it:
 * `${FRONTEND_URL}/reset-password?token=<raw token>`. The server holds only its hash, so this
 * value is the one secret the whole flow turns on and it is never stored or logged here.
 *
 * Two checks that look alike do different jobs. The confirm-password match is a courtesy to the
 * person typing and never leaves the browser. The length rule is enforced again by the server,
 * which is what actually protects the account — this screen refusing early only saves a round trip.
 */
export const ResetPasswordPage = () => {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  useScreenStylesheet(
    { id: 'login.css', css: loginCss },
    { id: 'password-reset.css', css: resetCss },
  );
  useDocumentTitle('סיסמה חדשה / New Password — FieldSync');

  const token = params.get('token') ?? '';

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState<{ password?: boolean; confirm?: boolean }>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ResetPasswordFailure | null>(null);
  const [done, setDone] = useState(false);

  const errors = useMemo(
    () => ({
      // Only complained about once there is something to judge; an empty box is "not filled in
      // yet", not "too short" or "does not match".
      password: password.length > 0 && password.length < MIN_PASSWORD_LENGTH,
      confirm: confirm.length > 0 && confirm !== password,
    }),
    [password, confirm],
  );

  const canSubmit =
    token.length > 0 && password.length >= MIN_PASSWORD_LENGTH && confirm === password;

  const submit = useCallback(async (): Promise<void> => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await resetPassword({ token, password });
      setDone(true);
    } catch (error) {
      setFailure(classifyResetPasswordError(error));
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, submitting, token, password]);

  const alertMessage =
    token.length === 0 ? t.resetPassword.errors.missingToken
    : failure === 'INVALID_RESET_TOKEN' ? t.resetPassword.errors.invalidToken
    : failure === 'WEAK_PASSWORD' ? t.resetPassword.errors.weakPassword
    : failure === 'NETWORK' ? t.resetPassword.errors.network
    : failure ? t.resetPassword.errors.generic
    : null;

  /** A dead or absent link is only recoverable by asking for another one. */
  const offerNewLink = token.length === 0 || failure === 'INVALID_RESET_TOKEN';

  return (
    <AuthShell brand={t.resetPassword.brand}>
      {done ? (
        <section className="auth-step auth-step--current auth-step--center" aria-label={t.resetPassword.doneTitle}>
          <span className="status-badge status-badge--solid" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none"
                 stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.5l4.5 4.5L19 7.5" />
            </svg>
          </span>

          <header className="form-header">
            <h2 className="form-title">{t.resetPassword.doneTitle}</h2>
            <p className="form-subtitle">{t.resetPassword.doneSubtitle}</p>
          </header>

          {/* Nothing was issued by the reset, so the person signs in with the new password. */}
          <button
            type="button"
            className="btn btn--primary btn--full"
            onClick={() => navigate('/login', { replace: true })}
          >
            {t.resetPassword.continue}
          </button>
        </section>
      ) : (
        <section className="auth-step auth-step--current" aria-label={t.resetPassword.title}>
          <Link to="/login" className="back-link">
            <svg className="back-link__chev" width="14" height="14" viewBox="0 0 24 24"
                 fill="none" stroke="currentColor" strokeWidth="2"
                 strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 6l-6 6 6 6" />
            </svg>
            {t.resetPassword.backToSignIn}
          </Link>

          <header className="form-header">
            <h2 className="form-title">{t.resetPassword.title}</h2>
            <p className="form-subtitle">{t.resetPassword.subtitle}</p>
          </header>

          {alertMessage ? <FormAlert message={alertMessage} /> : null}

          <form
            className="reset-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              void submit();
            }}
          >
            <PasswordField
              id="new-password" name="newPassword" label={t.resetPassword.newPassword.label}
              placeholder={t.resetPassword.newPassword.placeholder}
              toggleLabel={t.resetPassword.togglePassword}
              minLength={MIN_PASSWORD_LENGTH} maxLength={MAX_PASSWORD_LENGTH}
              value={password} onChange={setPassword}
              onBlur={() => setTouched((prev) => ({ ...prev, password: true }))}
              touched={!!touched.password}
              {...(errors.password ? { error: t.resetPassword.newPassword.error } : {})}
            />

            <PasswordField
              id="confirm-password" name="confirmPassword" label={t.resetPassword.confirmPassword.label}
              placeholder={t.resetPassword.confirmPassword.placeholder}
              hint={t.resetPassword.confirmPassword.hint}
              toggleLabel={t.resetPassword.togglePassword} maxLength={MAX_PASSWORD_LENGTH}
              value={confirm} onChange={setConfirm}
              onBlur={() => setTouched((prev) => ({ ...prev, confirm: true }))}
              touched={!!touched.confirm}
              {...(errors.confirm ? { error: t.resetPassword.confirmPassword.error } : {})}
            />

            <button
              type="submit"
              className="btn btn--primary btn--full btn--advance"
              disabled={!canSubmit || submitting}
            >
              {submitting ? t.resetPassword.submitting : t.resetPassword.submit}
            </button>
          </form>

          {offerNewLink ? (
            <p className="form-footer">
              <Link to="/forgot-password" className="form-link form-link--strong">
                {t.resetPassword.requestNewLink}
              </Link>
            </p>
          ) : null}
        </section>
      )}
    </AuthShell>
  );
};
