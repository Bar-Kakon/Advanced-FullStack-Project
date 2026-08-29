import { useCallback, useState } from 'react';

import {
  classifyForgotPasswordError,
  requestPasswordReset,
  type ForgotPasswordFailure,
} from '../../../api/auth.api';
import { ButtonSpinner } from '../../../components/ButtonSpinner';
import { FormAlert } from '../../../components/FormAlert';
import { TextField } from '../../../components/TextField';
import { useLanguage } from '../../../i18n/useLanguage';
import { EMAIL_PATTERN } from '../../../shared/validation';

/**
 * Ask for a reset link. One component, one API call — used by the Forgot password screen and by
 * the Reset password screen when it was opened without a usable link, so the two can never drift
 * into two request mechanisms.
 *
 * The only failure it can report is not reaching the server. The server answers the same way for a
 * known address, an unknown one and a suspended account, so there is nothing here to leak.
 */
export const RequestResetForm = ({
  submitLabel,
  onSent,
}: {
  submitLabel: string;
  onSent: (email: string) => void;
}) => {
  const { t } = useLanguage();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<ForgotPasswordFailure | null>(null);

  const invalid = email.length > 0 && !EMAIL_PATTERN.test(email.trim());
  const canSubmit = EMAIL_PATTERN.test(email.trim());

  const send = useCallback(async (): Promise<void> => {
    // The guard is what prevents a duplicate submission, not just the disabled attribute — a
    // second Enter can arrive before React has re-rendered the button.
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await requestPasswordReset({ email: email.trim() });
      onSent(email.trim());
    } catch (error) {
      setFailure(classifyForgotPasswordError(error));
    } finally {
      setSubmitting(false);
    }
  }, [canSubmit, submitting, email, onSent]);

  const alertMessage =
    failure === 'NETWORK' ? t.forgotPassword.errors.network
    : failure ? t.forgotPassword.errors.generic
    : null;

  return (
    <>
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
          aria-busy={submitting}
        >
          {submitLabel}
          {submitting ? <ButtonSpinner /> : null}
        </button>
      </form>
    </>
  );
};
