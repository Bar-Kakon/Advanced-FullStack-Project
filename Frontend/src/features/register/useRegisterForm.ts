import { useCallback, useMemo, useState } from 'react';

import { classifyRegisterError, registerAccount, type RegisterFailure } from '../../api/auth.api';
import {
  AVAILABILITY_STATUSES,
  COMPANY_POSITIONS,
  COMPANY_STANDINGS,
  CONTRACTOR_CATEGORIES,
  DRILLING_SPECIALTY,
  DRILLING_TYPES,
  REGIONS,
  REGISTRATION_CATEGORIES,
  SPECIALTIES_BY_CATEGORY,
  type CompanyStanding,
  type DrillingType,
  type RegistrationCategory,
} from '../../api/types';
import {
  EMAIL_PATTERN,
  isBlank,
  isValidPassword,
  isValidPhone,
  isValidText,
} from '../../shared/validation';
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
 * Why one field is being refused. The screen picks its wording from this rather than from a
 * boolean, so "leave it blank" and "that is not a phone number" never share a message.
 */
export type FieldIssue = 'required' | 'format' | 'tooShort' | 'mismatch';

export type RegisterErrors = Partial<Record<FieldName, FieldIssue>>;

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
 * The closed list behind each enum field, so a value that never came from the rendered options —
 * an edited `<option>`, a replayed event — is dropped instead of being held in state. The server
 * refuses the same values; this stops the form from believing in one it would refuse.
 */
const ENUM_VALUES: Partial<Record<FieldName, readonly string[]>> = {
  standing: COMPANY_STANDINGS,
  companyPosition: COMPANY_POSITIONS,
  registrationCategory: REGISTRATION_CATEGORIES,
  region: REGIONS,
  availability: AVAILABILITY_STATUSES,
  contractorCategory: CONTRACTOR_CATEGORIES,
};

const isAcceptedEnum = (field: FieldName, value: unknown): boolean => {
  const allowed = ENUM_VALUES[field];
  if (!allowed) return true;
  if (value === '') return true;
  return typeof value === 'string' && allowed.includes(value);
};

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
    if (!isAcceptedEnum(field, value)) return;
    setValues((prev) => (prev[field] === value ? prev : { ...prev, [field]: value }));
    // Any edit invalidates the previous server answer; leaving it up would let "email already
    // registered" sit above an email the user has since corrected.
    setFailure(null);
  }, []);

  /** Only subtypes from the published list are held, and never the same one twice. */
  const toggleDrillingType = useCallback((code: DrillingType, on: boolean): void => {
    if (!DRILLING_TYPES.includes(code)) return;
    setValues((prev) => ({
      ...prev,
      drillingTypes: on
        ? prev.drillingTypes.includes(code)
          ? prev.drillingTypes
          : [...prev.drillingTypes, code]
        : prev.drillingTypes.filter((held) => held !== code),
    }));
    setFailure(null);
  }, []);

  /**
   * Changing standing changes which fields the form has, so the values belonging to the path being
   * left are cleared with it. Without this an owner could fill in an office phone, switch to
   * employee, and carry a value the employee form never shows — the payload builder already omits
   * it, but a form holding data its own UI does not display is one edit away from sending it.
   */
  const setStanding = useCallback((next: CompanyStanding): void => {
    if (!COMPANY_STANDINGS.includes(next)) return;
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
    if (!REGISTRATION_CATEGORIES.includes(next)) return;
    setValues((prev) =>
      prev.registrationCategory === next
        ? prev
        : {
            ...prev,
            registrationCategory: next,
            specialty: '',
            specialtyOther: '',
            drillingTypes: [],
            // Belongs to the contractor route alone, so it leaves with it rather than being
            // carried into a route whose form never shows it.
            ...(next === 'contractor' ? {} : { contractorCategory: '' as const }),
          },
    );
    setFailure(null);
  }, []);

  /** Refinements belong to the specialty that carries them and are dropped with it. */
  const setSpecialty = useCallback((next: RegisterFormValues['specialty']): void => {
    setValues((prev) => {
      // A specialty is only ever read against the route currently chosen, which is the same pairing
      // the server validates. One from another route is dropped rather than held.
      const offered =
        prev.registrationCategory === ''
          ? []
          : (SPECIALTIES_BY_CATEGORY[prev.registrationCategory] as readonly string[]);
      if (next !== '' && !offered.includes(next)) return prev;

      return {
        ...prev,
        specialty: next,
        ...(isOtherSpecialty(prev.registrationCategory, next) ? {} : { specialtyOther: '' }),
        ...(next === DRILLING_SPECIALTY ? {} : { drillingTypes: [] }),
      };
    });
    setFailure(null);
  }, []);

  const markTouched = useCallback((field: FieldName): void => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  /** Whether this registration is completing a Google sign-in rather than setting a password. */
  const viaGoogle = values.googleIdToken !== null;

  /**
   * One issue per field, derived from the values alone. Nothing here is stored, so a field stops
   * being an error on the keystroke that fixes it rather than on the next blur — which is what
   * makes the red border and the warning icon leave the moment the value is good again.
   *
   * `required` is only reported for a field that is genuinely empty, so a pristine form carries no
   * issue at all until the person has been in the field: the screen gates every message on
   * `touched` on top of this.
   */
  const errors = useMemo((): RegisterErrors => {
    const issues: RegisterErrors = {};

    // Names, the company name, the city and the free-text specialty are all prose the person
    // typed, and they answer to the same rule.
    const prose = (field: 'firstName' | 'lastName' | 'companyName' | 'city' | 'specialtyOther'): void => {
      if (isBlank(values[field])) issues[field] = 'required';
      else if (!isValidText(values[field])) issues[field] = 'format';
    };

    prose('firstName');
    prose('lastName');
    prose('companyName');

    if (isBlank(values.email)) issues.email = 'required';
    else if (!EMAIL_PATTERN.test(values.email.trim())) issues.email = 'format';

    if (values.registrationCategory === '') issues.registrationCategory = 'required';
    if (values.specialty === '') issues.specialty = 'required';

    // Required exactly when the route's own free-text code is the answer, which is the condition
    // the server enforces too.
    if (isOtherSpecialty(values.registrationCategory, values.specialty)) prose('specialtyOther');

    prose('city');

    if (values.region === '') issues.region = 'required';

    // Optional on their own: an untouched box is not an error, a filled-in one has to be a number.
    if (!isBlank(values.officePhone) && !isValidPhone(values.officePhone)) {
      issues.officePhone = 'format';
    }
    if (!isBlank(values.businessPhone) && !isValidPhone(values.businessPhone)) {
      issues.businessPhone = 'format';
    }

    if (values.standing === 'employee') {
      if (values.companyPosition === '') issues.companyPosition = 'required';
    } else if (values.registrationCategory === 'contractor' && values.contractorCategory === '') {
      issues.contractorCategory = 'required';
    }

    if (!viaGoogle) {
      if (values.password.length === 0) issues.password = 'required';
      else if (!isValidPassword(values.password, MIN_PASSWORD_LENGTH)) issues.password = 'tooShort';

      if (values.confirmPassword.length === 0) issues.confirmPassword = 'required';
      else if (values.confirmPassword !== values.password) issues.confirmPassword = 'mismatch';
    }

    if (!values.acceptedTerms) issues.acceptedTerms = 'required';

    return issues;
  }, [values, viaGoogle]);

  const detailsComplete = useMemo(() => {
    const required = viaGoogle ? REQUIRED_WITH_GOOGLE : REQUIRED;
    // Every Step 1 field has to be answered, and none of them may carry an issue. Reading the two
    // conditions off the same `errors` object is what keeps the button and the messages agreeing.
    const filled = required.every((field) => !isBlank(String(values[field])));
    const stepOneFields: readonly FieldName[] = [
      ...required,
      'specialtyOther', 'officePhone', 'businessPhone', 'companyPosition', 'contractorCategory',
    ];
    const clean = stepOneFields.every((field) => errors[field] === undefined);

    return filled && clean;
  }, [values, viaGoogle, errors]);

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
    values, setValue, setStanding, setCategory, setSpecialty, toggleDrillingType,
    touched, markTouched, errors, viaGoogle,
    step, goNext, goBack, detailsComplete, isComplete,
    submitting, failure, submit,
  };
};
