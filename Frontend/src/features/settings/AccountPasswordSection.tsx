import { useState } from 'react';

import {
  changePassword,
  classifyPasswordChangeError,
  classifyPasswordSetupError,
  requestPasswordSetup,
  type PasswordChangeFailure,
  type PasswordSetupFailure,
} from '../../api/auth.api';
import { useAuth } from '../../auth/useAuth';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { FormAlert } from '../../components/FormAlert';
import { PasswordField } from '../../components/PasswordField';
import { useLanguage } from '../../i18n/useLanguage';
import { fillIn } from './fillIn';

const MIN_PASSWORD_LENGTH = 8;
const MAX_PASSWORD_LENGTH = 200;

export const AccountPasswordSection = ({
  hasPassword,
  email,
}: {
  hasPassword: boolean;
  email: string;
}) => {
  const { t } = useLanguage();
  const copy = t.settings.account;
  const { endSessionWithNotice } = useAuth();

  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState<{ current?: boolean; next?: boolean; confirm?: boolean }>({});
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<PasswordChangeFailure | null>(null);

  const [setupBusy, setSetupBusy] = useState(false);
  const [setupSent, setSetupSent] = useState(false);
  const [setupFailure, setSetupFailure] = useState<PasswordSetupFailure | null>(null);

  if (!hasPassword) {
    const sendSetupLink = async (): Promise<void> => {
      if (setupBusy) return;
      setSetupBusy(true);
      setSetupFailure(null);
      try {
        await requestPasswordSetup();
        setSetupSent(true);
      } catch (error) {
        setSetupFailure(classifyPasswordSetupError(error));
      } finally {
        setSetupBusy(false);
      }
    };

    const setupMessage =
      setupFailure === 'TOO_MANY' ? copy.tooManyRequests
      : setupFailure === 'NETWORK' ? t.settings.errors.network
      : setupFailure !== null ? copy.passwordSetupFailed
      : null;

    return (
      <>
        <h3 className="settings-section__title">{copy.passwordTitle}</h3>
        <p className="settings-section__note" data-testid="google-only-note">{copy.googleOnlyNote}</p>
        <p className="settings-section__note">{copy.googleOnlySteps}</p>
        {setupMessage === null ? null : <FormAlert message={setupMessage} />}
        {setupSent ? (
          <p className="settings-section__note" role="status" data-testid="password-setup-sent">
            {fillIn(copy.passwordSetupSent, { email })}
          </p>
        ) : null}
        <button
          type="button"
          id="settings-password-setup"
          className="btn btn--ghost"
          disabled={setupBusy}
          aria-busy={setupBusy}
          onClick={() => void sendSetupLink()}
        >
          {copy.passwordSetupSubmit}
          {setupBusy ? <ButtonSpinner /> : null}
        </button>
      </>
    );
  }

  const errors = {
    next: next.length > 0 && next.length < MIN_PASSWORD_LENGTH,
    confirm: confirm.length > 0 && confirm !== next,
  };
  const canSubmit = current.length > 0 && next.length >= MIN_PASSWORD_LENGTH && confirm === next;

  const submit = async (): Promise<void> => {
    if (!canSubmit || busy) return;
    setBusy(true);
    setFailure(null);
    try {
      await changePassword({ currentPassword: current, newPassword: next });
      setCurrent('');
      setNext('');
      setConfirm('');
      endSessionWithNotice('password_changed');
    } catch (error) {
      setFailure(classifyPasswordChangeError(error));
      setBusy(false);
    }
  };

  const failureMessage =
    failure === 'CURRENT_INCORRECT' ? copy.currentPasswordIncorrect
    : failure === 'WEAK_PASSWORD' ? copy.passwordTooShort
    : failure === 'TOO_MANY' ? copy.tooManyRequests
    : failure === 'NETWORK' ? t.settings.errors.network
    : failure !== null ? copy.passwordFailed
    : null;

  return (
    <>
      <h3 className="settings-section__title">{copy.passwordTitle}</h3>
      <p className="settings-section__note">{copy.passwordNote}</p>

      {failureMessage === null ? null : <FormAlert message={failureMessage} />}

      <form
        className="settings-account-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <PasswordField
          id="settings-current-password"
          name="currentPassword"
          label={copy.currentPasswordLabel}
          placeholder={copy.passwordPlaceholder}
          toggleLabel={copy.togglePassword}
          autoComplete="current-password"
          maxLength={MAX_PASSWORD_LENGTH}
          value={current}
          onChange={setCurrent}
          onBlur={() => setTouched((prev) => ({ ...prev, current: true }))}
          touched={!!touched.current}
        />
        <PasswordField
          id="settings-new-password"
          name="newPassword"
          label={copy.newPasswordLabel}
          placeholder={copy.passwordPlaceholder}
          toggleLabel={copy.togglePassword}
          minLength={MIN_PASSWORD_LENGTH}
          maxLength={MAX_PASSWORD_LENGTH}
          value={next}
          onChange={setNext}
          onBlur={() => setTouched((prev) => ({ ...prev, next: true }))}
          touched={!!touched.next}
          {...(errors.next ? { error: copy.passwordTooShort } : {})}
        />
        <PasswordField
          id="settings-confirm-password"
          name="confirmPassword"
          label={copy.confirmPasswordLabel}
          placeholder={copy.passwordPlaceholder}
          toggleLabel={copy.togglePassword}
          maxLength={MAX_PASSWORD_LENGTH}
          value={confirm}
          onChange={setConfirm}
          onBlur={() => setTouched((prev) => ({ ...prev, confirm: true }))}
          touched={!!touched.confirm}
          invalid={errors.confirm}
          {...(errors.confirm ? { error: copy.passwordMismatch } : {})}
        />
        <button
          type="submit"
          id="settings-password-submit"
          className="btn btn--primary"
          disabled={!canSubmit || busy}
          aria-busy={busy}
        >
          {copy.passwordSubmit}
          {busy ? <ButtonSpinner /> : null}
        </button>
      </form>
    </>
  );
};
