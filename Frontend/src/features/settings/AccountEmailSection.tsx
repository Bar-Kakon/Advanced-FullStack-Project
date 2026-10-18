import { useState } from 'react';

import {
  classifyEmailChangeRequestError,
  requestEmailChange,
  type EmailChangeRequestFailure,
} from '../../api/auth.api';
import type { AccountSettings } from '../../api/settings.types';
import { ButtonSpinner } from '../../components/ButtonSpinner';
import { FormAlert } from '../../components/FormAlert';
import { TextField } from '../../components/TextField';
import { formatInstantTime } from '../../i18n/dateFormat';
import { useLanguage } from '../../i18n/useLanguage';
import { fillIn } from './fillIn';

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_EMAIL_LENGTH = 254;

export const AccountEmailSection = ({
  email,
  pending,
  onRequested,
}: {
  email: string;
  pending: AccountSettings['pendingEmailChange'];
  onRequested: () => Promise<void>;
}) => {
  const { t, lang } = useLanguage();
  const copy = t.settings.account;
  const [newEmail, setNewEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [failure, setFailure] = useState<EmailChangeRequestFailure | null>(null);

  const normalized = newEmail.trim().toLowerCase();
  const shapeValid = EMAIL_SHAPE.test(normalized);
  const sameAsCurrent = normalized === email.toLowerCase();

  const submit = async (): Promise<void> => {
    setTouched(true);
    if (!shapeValid || sameAsCurrent || busy) return;
    setBusy(true);
    setFailure(null);
    setSentTo(null);
    try {
      await requestEmailChange(normalized);
      setSentTo(normalized);
      setNewEmail('');
      setTouched(false);
      await onRequested();
    } catch (error) {
      setFailure(classifyEmailChangeRequestError(error));
    } finally {
      setBusy(false);
    }
  };

  const fieldError =
    !touched ? undefined
    : !shapeValid ? copy.newEmailInvalid
    : sameAsCurrent ? copy.emailSameAddress
    : undefined;

  const failureMessage =
    failure === 'SAME_ADDRESS' ? copy.emailSameAddress
    : failure === 'INVALID_EMAIL' ? copy.newEmailInvalid
    : failure === 'TOO_MANY' ? copy.tooManyRequests
    : failure === 'NETWORK' ? t.settings.errors.network
    : failure !== null ? copy.emailFailed
    : null;

  return (
    <>
      <h3 className="settings-section__title">{copy.emailTitle}</h3>
      <p className="settings-section__note settings-account__current" data-testid="account-email">
        {fillIn(copy.emailCurrent, { email })}
      </p>
      <p className="settings-section__note">{copy.emailNote}</p>

      {failureMessage === null ? null : <FormAlert message={failureMessage} />}

      {sentTo !== null ? (
        <p className="settings-section__note" role="status" data-testid="email-change-sent">
          {fillIn(copy.emailSent, { email: sentTo })}
        </p>
      ) : pending !== null ? (
        <p className="settings-section__note" data-testid="email-change-pending">
          {fillIn(copy.emailPending, {
            email: pending.email,
            time: formatInstantTime(pending.expiresAt, lang),
          })}
        </p>
      ) : null}

      <form
        className="settings-account-form"
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <TextField
          id="settings-new-email"
          label={copy.newEmailLabel}
          type="email"
          dir="ltr"
          autoComplete="email"
          placeholder={copy.newEmailPlaceholder}
          maxLength={MAX_EMAIL_LENGTH}
          value={newEmail}
          onChange={setNewEmail}
          onBlur={() => setTouched(true)}
          touched={touched}
          {...(fieldError === undefined ? {} : { error: fieldError })}
        />
        <button
          type="submit"
          id="settings-email-submit"
          className="btn btn--primary"
          disabled={busy}
          aria-busy={busy}
        >
          {copy.emailSubmit}
          {busy ? <ButtonSpinner /> : null}
        </button>
      </form>
    </>
  );
};
