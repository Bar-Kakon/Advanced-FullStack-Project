import { useCallback, useMemo, useState } from 'react';

import { classifyLoginError, login, type LoginFailure } from '../../api/auth.api';
import type { LoginResponse } from '../../api/types';
import { EMAIL_PATTERN } from '../../shared/validation';

export interface LoginFormValues {
  email: string;
  password: string;
}

export type LoginFieldName = keyof LoginFormValues;

const emptyLoginForm: LoginFormValues = { email: '', password: '' };

/**
 * Login's form state, and the one request it makes.
 *
 * There is no password policy here, and that absence is the decision. Register owns the policy;
 * checking a minimum length at sign-in would tell an attacker which passwords could never belong
 * to an account, and it would reject a person whose password predates a policy change. The screen
 * asks only that both boxes are filled and that the address is shaped like an address.
 *
 * Success is handed to the caller rather than acted on here: where a signed-in person goes is a
 * routing question, and this hook has no business knowing the answer.
 */
export const useLoginForm = (onSuccess: (response: LoginResponse) => void) => {
  const [values, setValues] = useState<LoginFormValues>(emptyLoginForm);
  // Which fields the person has actually finished with. The red state stays hidden until then, so
  // a form nobody has filled in is never shown as wrong — the static screen's `.touched` rule.
  const [touched, setTouched] = useState<Partial<Record<LoginFieldName, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<LoginFailure | null>(null);

  const setValue = useCallback(<K extends LoginFieldName>(field: K, value: LoginFormValues[K]): void => {
    setValues((prev) => (prev[field] === value ? prev : { ...prev, [field]: value }));
    // Any edit invalidates the previous server answer; leaving it up would let "invalid email or
    // password" sit above credentials the person has since corrected.
    setFailure(null);
  }, []);

  const markTouched = useCallback((field: LoginFieldName): void => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  const errors = useMemo(
    () => ({ email: values.email.length > 0 && !EMAIL_PATTERN.test(values.email.trim()) }),
    [values.email],
  );

  const isComplete = useMemo(
    () => EMAIL_PATTERN.test(values.email.trim()) && values.password.length > 0,
    [values.email, values.password],
  );

  const submit = useCallback(async (): Promise<void> => {
    if (!isComplete || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      const response = await login({ email: values.email.trim(), password: values.password });
      onSuccess(response);
    } catch (error) {
      setFailure(classifyLoginError(error));
    } finally {
      setSubmitting(false);
    }
  }, [isComplete, submitting, values.email, values.password, onSuccess]);

  return { values, setValue, touched, markTouched, errors, isComplete, submitting, failure, submit };
};
