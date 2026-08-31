import { useCallback, useMemo, useState } from 'react';

import { classifyRegisterError, registerAccount, type RegisterFailure } from '../../api/auth.api';
import { DRILLING_SPECIALTY, type CompanyStanding, type RegistrationCategory } from '../../api/types';
import { EMAIL_PATTERN } from '../../shared/validation';
import {
  buildRegisterPayload,
  emptyRegisterForm,
  isOtherSpecialty,
  type RegisterFormValues,
} from './buildRegisterPayload';

export const MIN_PASSWORD_LENGTH = 8;

export type FieldName = keyof RegisterFormValues;

/** Two steps: the account and business details, then the email-delivery choice. */
export const REGISTER_STEPS = ['details', 'notifications'] as const;
export type RegisterStep = (typeof REGISTER_STEPS)[number];

/**
 * Which fields Step 1 must have before it can be left. The two phones are absent by design — they
 * are independently optional — and `specialtyOther` is absent because it is only required
 * conditionally, which `detailsComplete` handles separately.
 */
const REQUIRED: readonly FieldName[] = [
  'firstName', 'lastName', 'companyName', 'email', 'registrationCategory', 'specialty',
  'city', 'region', 'password', 'confirmPassword',
];

/** The same list without the two password fields, which the Google path does not have at all. */
const REQUIRED_WITH_GOOGLE: readonly FieldName[] = REQUIRED.filter(
  (field) => field !== 'password' && field !== 'confirmPassword',
);

/**
 * What a verified Google sign-in contributes to Register: the identity, and nothing else.
 *
 * There is deliberately no registration category, no specialty and no business here — Google does
 * not know them, and defaulting any of them would put somebody into a trade they never chose.
 */
export interface GoogleRegistration {
  readonly idToken: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
}

const withGoogle = (google: GoogleRegistration | null): RegisterFormValues =>
  google === null
    ? emptyRegisterForm
    : {
        ...emptyRegisterForm,
        email: google.email,
        firstName: google.firstName,
        lastName: google.lastName,
        googleIdToken: google.idToken,
      };

/**
 * `onSuccess` rather than a success state of its own: registration ends by going to Login, and
 * where a screen navigates is the page's business, not this hook's.
 */
export const useRegisterForm = (onSuccess: () => void, google: GoogleRegistration | null = null) => {
  const [values, setValues] = useState<RegisterFormValues>(() => withGoogle(google));
  const [step, setStep] = useState<RegisterStep>('details');
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

  /**
   * The route decides which taxonomy is offered, so changing it clears the answer given under the
   * previous one. A specialty from another route would be refused by the server anyway; clearing it
   * means the form never displays one list while holding a value from a different one.
   */
  const setCategory = useCallback((next: RegistrationCategory): void => {
    setValues((prev) =>
      prev.registrationCategory === next
        ? prev
        : { ...prev, registrationCategory: next, specialty: '', specialtyOther: '', drillingTypes: [] },
    );
    setFailure(null);
  }, []);

  /** Refinements belong to the specialty that carries them and are dropped with it. */
  const setSpecialty = useCallback((next: RegisterFormValues['specialty']): void => {
    setValues((prev) => ({
      ...prev,
      specialty: next,
      ...(isOtherSpecialty(prev.registrationCategory, next) ? {} : { specialtyOther: '' }),
      ...(next === DRILLING_SPECIALTY ? {} : { drillingTypes: [] }),
    }));
    setFailure(null);
  }, []);

  const markTouched = useCallback((field: FieldName): void => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  /** Whether this registration is completing a Google sign-in rather than setting a password. */
  const viaGoogle = values.googleIdToken !== null;

  const errors = useMemo(() => {
    const emailBad = values.email.length > 0 && !EMAIL_PATTERN.test(values.email.trim());
    const passwordBad = values.password.length > 0 && values.password.length < MIN_PASSWORD_LENGTH;
    // Only complained about once there is something to compare; an empty confirm field is
    // "not filled in yet", not "does not match".
    const mismatch = values.confirmPassword.length > 0 && values.confirmPassword !== values.password;
    return { email: emailBad, password: passwordBad, confirmPassword: mismatch };
  }, [values.email, values.password, values.confirmPassword]);

  const detailsComplete = useMemo(() => {
    const required = viaGoogle ? REQUIRED_WITH_GOOGLE : REQUIRED;
    const filled = required.every((f) => String(values[f]).trim().length > 0);
    const otherOk =
      !isOtherSpecialty(values.registrationCategory, values.specialty)
      || values.specialtyOther.trim().length > 0;
    // An employee is claiming a seat, and the position is one of the three values it is matched on.
    const positionOk = values.standing !== 'employee' || values.companyPosition !== '';
    // The Google path has no password to check, and asking for one would be inventing a credential
    // the account is deliberately opened without.
    const passwordOk =
      viaGoogle
      || (values.password === values.confirmPassword
        && !errors.password
        && values.password.length >= MIN_PASSWORD_LENGTH);

    return filled && otherOk && positionOk && passwordOk && !errors.email;
  }, [values, viaGoogle, errors.email, errors.password]);

  // Step 2 asks for the Terms and one of the two delivery answers. Declining email is a complete
  // answer, which is why this reads for a chosen boolean rather than for a true one.
  const isComplete = detailsComplete && values.acceptedTerms && values.operationalEmail !== null;

  const goNext = useCallback((): void => {
    setStep((current) => (current === 'details' ? 'notifications' : current));
  }, []);

  const goBack = useCallback((): void => {
    setStep((current) => (current === 'notifications' ? 'details' : current));
    setFailure(null);
  }, []);

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

  return {
    values, setValue, setStanding, setCategory, setSpecialty,
    touched, markTouched, errors, viaGoogle,
    step, goNext, goBack, detailsComplete, isComplete,
    submitting, failure, submit,
  };
};
