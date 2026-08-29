import { useLanguage } from '../../i18n/useLanguage';
import { FormAlert } from '../../components/FormAlert';
import { PasswordField } from '../../components/PasswordField';
import { TextField } from '../../components/TextField';
import type { useLoginForm } from './useLoginForm';

/** The bound the server puts on the address; the password box is bounded server-side too. */
const MAX = { email: 254, password: 200 } as const;

export const LoginForm = ({ form }: { form: ReturnType<typeof useLoginForm> }) => {
  const { t } = useLanguage();
  const { values, setValue, touched, markTouched, isComplete, submitting, failure } = form;

  /**
   * One message for every way a sign-in can fail against a real account. `INVALID_CREDENTIALS`
   * covers both "no such address" and "wrong password", and nothing here re-splits it — that
   * unified answer is what stops the screen being used to discover who has an account.
   */
  const alertMessage =
    failure === 'INVALID_CREDENTIALS' ? t.login.errors.credentials
    : failure === 'NETWORK' ? t.login.errors.network
    : failure ? t.login.errors.generic
    : null;

  return (
    <>
      {alertMessage ? <FormAlert message={alertMessage} /> : null}

      {/* onSubmit rather than a click handler: it also fires on Enter in a text field, which is
          how people actually submit a form. preventDefault stops the browser's own navigation. */}
      <form
        className="login-form"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void form.submit();
        }}
      >
        <TextField
          id="email" label={t.login.email.label} type="email" dir="ltr" withWarning
          placeholder={t.login.email.placeholder} autoComplete="email" maxLength={MAX.email} required
          value={values.email} onChange={(v) => setValue('email', v)}
          onBlur={() => markTouched('email')} touched={!!touched.email}
        />

        <PasswordField
          id="password" name="password" label={t.login.password.label}
          placeholder={t.login.password.placeholder} toggleLabel={t.login.togglePassword}
          autoComplete="current-password" maxLength={MAX.password} withWarning
          value={values.password} onChange={(v) => setValue('password', v)}
          onBlur={() => markTouched('password')} touched={!!touched.password}
        >
          {/* Forgot password is still `#`: those two screens exist as static prototypes only and
              have no route in this application yet. Same treatment the Register screen gives the
              Terms and Privacy links, for the same reason — the destination does not exist. */}
          <a href="#" className="form-link form-link--small forgot-link">{t.login.forgot}</a>
        </PasswordField>

        <button type="submit" className="btn btn--primary btn--full" disabled={!isComplete || submitting}>
          {submitting ? t.login.submitting : t.login.submit}
        </button>
      </form>
    </>
  );
};
