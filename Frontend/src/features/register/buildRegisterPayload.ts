import type { Availability, Region, RegisterPayload, Trade } from '../../api/types';

/** What the form holds while it is being filled: every field a string, exactly as typed. */
export interface RegisterFormValues {
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  specialty: Trade | '';
  specialtyOther: string;
  city: string;
  region: Region | '';
  officePhone: string;
  businessPhone: string;
  availability: Availability;
  password: string;
  confirmPassword: string;
  acceptedTerms: boolean;
}

export const emptyRegisterForm: RegisterFormValues = {
  firstName: '',
  lastName: '',
  companyName: '',
  email: '',
  specialty: '',
  specialtyOther: '',
  city: '',
  region: '',
  officePhone: '',
  businessPhone: '',
  // Pre-selected to match the server's own default for this field.
  availability: 'open',
  password: '',
  confirmPassword: '',
  acceptedTerms: false,
};

/**
 * The one place the form's shape becomes the endpoint's shape. Keeping it a plain function of its
 * input — no state, no network — is what makes the contract checkable in isolation.
 *
 * Three conversions are doing real work, and each one is a request the server would otherwise
 * reject:
 *
 * - **Empty optional fields are omitted, not sent blank.** `officePhone` is `Joi.string()`, and
 *   Joi treats `''` as invalid rather than absent, so sending an untouched phone field as an empty
 *   string fails the whole request with a 400.
 * - **`specialtyOther` is omitted unless the trade is `other`.** The server marks it `forbidden()`
 *   in every other case, so carrying a leftover value from a trade the user changed their mind
 *   about would fail validation.
 * - **`acceptedTerms` is a real boolean.** A browser checkbox submits the string `"on"`; the
 *   server accepts only `true`.
 *
 * The two phones are built from separate, independent expressions. Neither reads the other, so no
 * fallback between them can exist here.
 */
export const buildRegisterPayload = (values: RegisterFormValues): RegisterPayload => {
  if (values.specialty === '') throw new Error('buildRegisterPayload called without a specialty.');
  if (values.region === '') throw new Error('buildRegisterPayload called without a region.');

  const officePhone = values.officePhone.trim();
  const businessPhone = values.businessPhone.trim();
  const specialtyOther = values.specialtyOther.trim();

  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    standing: 'owner',
    companyName: values.companyName.trim(),
    email: values.email.trim(),
    password: values.password,
    confirmPassword: values.confirmPassword,
    specialty: values.specialty,
    ...(values.specialty === 'other' && specialtyOther ? { specialtyOther } : {}),
    city: values.city.trim(),
    region: values.region,
    ...(officePhone ? { officePhone } : {}),
    ...(businessPhone ? { businessPhone } : {}),
    availability: values.availability,
    acceptedTerms: true,
  };
};
