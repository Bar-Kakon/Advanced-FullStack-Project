import { useCallback, useMemo, useState } from 'react';

import { classifyRegisterError, registerAccount, type RegisterFailure } from '../../api/auth.api';
import type { RegisterResponse } from '../../api/types';
import { setAccessToken } from '../../auth/tokenStorage';
import { EMAIL_PATTERN } from '../../shared/validation';
import { buildRegisterPayload, emptyRegisterForm, type RegisterFormValues } from './buildRegisterPayload';

export const MIN_PASSWORD_LENGTH = 8;

export type FieldName = keyof RegisterFormValues;

/**
 * Which fields must be filled before the account can be created. The two phones are absent by
 * design — they are independently optional — and `specialtyOther` is absent because it is only
 * required conditionally, which `isComplete` handles separately.
 */
const REQUIRED: readonly FieldName[] = [
  'firstName', 'lastName', 'companyName', 'email', 'specialty', 'city', 'region', 'password', 'confirmPassword',
];

export const useRegisterForm = () => {
  const [values, setValues] = useState<RegisterFormValues>(emptyRegisterForm);
  // Which fields the user has actually finished with. Errors stay hidden until then, so a pristine
  // form is never scolded for being empty — the same rule the static screen's `.touched` class had.
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<RegisterFailure | null>(null);
  const [result, setResult] = useState<RegisterResponse | null>(null);

  const setValue = useCallback(<K extends FieldName>(field: K, value: RegisterFormValues[K]): void => {
    setValues((prev) => (prev[field] === value ? prev : { ...prev, [field]: value }));
    // Any edit invalidates the previous server answer; leaving it up would let "email already
    // registered" sit above an email the user has since corrected.
    setFailure(null);
  }, []);

  const markTouched = useCallback((field: FieldName): void => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  const errors = useMemo(() => {
    const emailBad = values.email.length > 0 && !EMAIL_PATTERN.test(values.email.trim());
    const passwordBad = values.password.length > 0 && values.password.length < MIN_PASSWORD_LENGTH;
    // Only complained about once there is something to compare; an empty confirm field is
    // "not filled in yet", not "does not match".
    const mismatch = values.confirmPassword.length > 0 && values.confirmPassword !== values.password;
    return { email: emailBad, password: passwordBad, confirmPassword: mismatch };
  }, [values.email, values.password, values.confirmPassword]);

  const isComplete = useMemo(() => {
    const filled = REQUIRED.every((f) => String(values[f]).trim().length > 0);
    const otherOk = values.specialty !== 'other' || values.specialtyOther.trim().length > 0;
    const matches = values.password === values.confirmPassword;
    return (
      filled && otherOk && matches && values.acceptedTerms &&
      !errors.email && !errors.password && values.password.length >= MIN_PASSWORD_LENGTH
    );
  }, [values, errors.email, errors.password]);

  const submit = useCallback(async (): Promise<void> => {
    if (!isComplete || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      const response = await registerAccount(buildRegisterPayload(values));
      // Stored before the screen advances, so the very next request is already authenticated.
      setAccessToken(response.accessToken);
      setResult(response);
    } catch (error) {
      setFailure(classifyRegisterError(error));
    } finally {
      setSubmitting(false);
    }
  }, [isComplete, submitting, values]);

  return { values, setValue, touched, markTouched, errors, isComplete, submitting, failure, result, submit };
};
