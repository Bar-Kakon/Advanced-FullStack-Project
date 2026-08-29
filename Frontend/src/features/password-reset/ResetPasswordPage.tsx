import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { AuthShell } from '../../components/AuthShell';
import { PasswordField } from '../../components/PasswordField';
import { useLanguage } from '../../i18n/useLanguage';
import { useDocumentTitle } from '../../routes/useDocumentTitle';
import { useScreenStylesheet } from '../../styles/useScreenStylesheet';
import loginCss from '../login/login.css?inline';
import resetCss from './password-reset.css?inline';

/** The minimum Register enforces. Reset asks for the same, so one policy governs both. */
const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;

/**
 * Reset password — set a new password, then the confirmation.
 *
 * One thing the prototype could not do is done here: **the confirm-password match is checked**. A
 * stylesheet cannot compare two values, so the static screen carried a hint asking the person to
 * re-enter the password and left the comparison to "Stage 2". This is that comparison.
 *
 * **Nothing is submitted, and no token is read.** There is no reset endpoint on the API, no
 * password-reset token of any kind in the backend, and therefore no agreed name or shape for the
 * value an emailed link would carry. Reading a `?token=` off the URL would be inventing that
 * mechanism, so this screen does not — it renders the approved success step and states that no
 * password was changed. Everything about token validity, expiry, single use and the errors those
 * produce stays undecided; none of it is guessed at here.
 */
export const ResetPasswordPage = () => {
  const { t } = useLanguage();
  useScreenStylesheet(
    { id: 'login.css', css: loginCss },
    { id: 'password-reset.css', css: resetCss },
  );
  useDocumentTitle('סיסמה חדשה / New Password — FieldSync');

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState<{ password?: boolean; confirm?: boolean }>({});
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

  const canSubmit = password.length >= MIN_PASSWORD_LENGTH && confirm === password;

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

          <Link to="/login" className="btn btn--primary btn--full">{t.resetPassword.continue}</Link>

          <p className="form-hint" role="status">{t.resetPassword.noEndpoint}</p>
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

          <form
            className="reset-form"
            noValidate
            onSubmit={(e) => {
              e.preventDefault();
              if (canSubmit) setDone(true);
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

            <button type="submit" className="btn btn--primary btn--full btn--advance" disabled={!canSubmit}>
              {t.resetPassword.submit}
            </button>
          </form>
        </section>
      )}
    </AuthShell>
  );
};
