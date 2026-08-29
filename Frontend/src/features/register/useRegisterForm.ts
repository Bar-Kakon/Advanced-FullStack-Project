import { useCallback, useMemo, useState } from 'react';

import { classifyRegisterError, registerAccount, type RegisterFailure } from '../../api/auth.api';
import type { CompanyStanding } from '../../api/types';
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

/**
 * `onSuccess` rather than a success state of its own: registration ends by going to Login, and
 * where a screen navigates is the page's business, not this hook's.
 */
export const useRegisterForm = (onSuccess: () => void) => {
  const [values, setValues] = useState<RegisterFormValues>(emptyRegisterForm);
  // Which fields the user has actually finished with. Errors stay hidden until then, so a pristine
  // form is never scolded for being empty — the same rule the static screen's `.touched` class had.
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<RegisterFailure | null>(null);

  const setValue = useCallback(<K extends FieldName>(field: K, value: RegisterFormValues[K]): void => {
    setValues((prev) => (prev[field] === value ? prev : { ...prev, [field]: value }));
    // Any edit invalidates the previous server answer; leaving it up would let "email already
    // registered" sit above an email the user has since corrected.
    setFailure(null);
  }, []);

  /**
   * Changing standing changes which fields the form has, so the values belonging to the path being
   * left are cleared with it. Without this an owner could fill in an office phone, switch to
   * employee, and carry a value the employee form never shows — the payload builder already omits
   * it, but a form holding data its own UI does not display is one edit away from sending it.
   */
  const setStanding = useCallback((next: CompanyStanding): void => {
    setValues((prev) =>
      prev.standing === next
        ? prev
        : next === 'employee'
          ? { ...prev, standing: next, officePhone: '', availability: emptyRegisterForm.availability }
          : { ...prev, standing: next, companyPosition: '' },
    );
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
    // An employee is claiming a seat, and the position is one of the three values it is matched on.
    const positionOk = values.standing !== 'employee' || values.companyPosition !== '';
    const matches = values.password === values.confirmPassword;
    return (
      filled && otherOk && positionOk && matches && values.acceptedTerms &&
      !errors.email && !errors.password && values.password.length >= MIN_PASSWORD_LENGTH
    );
  }, [values, errors.email, errors.password]);

  const submit = useCallback(async (): Promise<void> => {
    if (!isComplete || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      await registerAccount(buildRegisterPayload(values));
      // Nothing is stored. Creating an account does not sign anyone in; Login does that, and it
      // is seconds away. A credential kept here would be one the flow guarantees nobody uses.
      onSuccess();
    } catch (error) {
      setFailure(classifyRegisterError(error));
    } finally {
      setSubmitting(false);
    }
  }, [isComplete, submitting, values, onSuccess]);

  return { values, setValue, setStanding, touched, markTouched, errors, isComplete, submitting, failure, submit };
};
