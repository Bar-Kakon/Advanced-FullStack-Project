import type { StructuredPlace } from '../../location/place.types';
import {
  DRILLING_SPECIALTY,
  OTHER_SPECIALTY,
  type Availability,
  type CompanyPosition,
  type CompanyStanding,
  type DrillingType,
  type Region,
  type RegisterPayload,
  type RegistrationCategory,
  type Specialty,
} from '../../api/types';

/** What the form holds while it is being filled, exactly as typed. */
export interface RegisterFormValues {
  firstName: string;
  lastName: string;
  standing: CompanyStanding;
  companyName: string;
  companyPosition: CompanyPosition | '';
  email: string;
  registrationCategory: RegistrationCategory | '';
  specialty: Specialty | '';
  specialtyOther: string;
  drillingTypes: readonly DrillingType[];
  city: string;
  place: StructuredPlace | null;
  region: Region | '';
  officePhone: string;
  businessPhone: string;
  availability: Availability;
  password: string;
  confirmPassword: string;
  /**
   * Set only while Register is completing a Google sign-in. It replaces the two password fields
   * rather than joining them: the account is opened with one credential or the other.
   */
  googleIdToken: string | null;
  acceptedTerms: boolean;
  /** `null` until the person answers. Neither option is preselected. */
  operationalEmail: boolean | null;
}

export const emptyRegisterForm: RegisterFormValues = {
  firstName: '',
  lastName: '',
  // Owner is what public Register has always created, so it is the state the form opens in.
  standing: 'owner',
  companyName: '',
  companyPosition: '',
  email: '',
  registrationCategory: '',
  specialty: '',
  specialtyOther: '',
  drillingTypes: [],
  city: '',
  place: null,
  region: '',
  officePhone: '',
  businessPhone: '',
  // Pre-selected to match the server's own default for this field.
  availability: 'open',
  password: '',
  confirmPassword: '',
  googleIdToken: null,
  acceptedTerms: false,
  operationalEmail: null,
};

/** True when this specialty is the free-text code belonging to the chosen route. */
export const isOtherSpecialty = (
  category: RegistrationCategory | '',
  specialty: Specialty | '',
): boolean => category !== '' && specialty === OTHER_SPECIALTY[category];

/**
 * The one place the form's shape becomes the endpoint's shape. Keeping it a plain function of its
 * input — no state, no network — is what makes the contract checkable in isolation.
 *
 * Five conversions are doing real work, and each one is a request the server would otherwise
 * reject:
 *
 * - **Empty optional fields are omitted, not sent blank.** `officePhone` is `Joi.string()`, and
 *   Joi treats `''` as invalid rather than absent, so sending an untouched phone field as an empty
 *   string fails the whole request with a 400.
 * - **`specialtyOther` is omitted unless the specialty is the route's own `other` code.** The
 *   server marks it `forbidden()` in every other case.
 * - **`drillingTypes` is omitted unless the specialty is `drilling`**, which the server forbids the
 *   same way — a leftover subtype from a changed answer would fail validation.
 * - **`acceptedTerms` is a real boolean.** A browser checkbox submits the string `"on"`; the
 *   server accepts only `true`.
 * - **`operationalEmail` is sent as the boolean that was actually chosen.** The server has no
 *   default for it, so an unanswered form is a bug here rather than a silent `false`.
 *
 * The two phones are built from separate, independent expressions. Neither reads the other, so no
 * fallback between them can exist here.
 *
 * The last conversion is `standing`. An owner sends the office phone and the availability, because
 * both belong to the business they are creating. An employee sends neither — those are the
 * company's, set by whoever runs it — and sends `companyPosition` instead, which is one of the
 * three values the server matches their invitation on.
 */
export const buildRegisterPayload = (values: RegisterFormValues): RegisterPayload => {
  if (values.registrationCategory === '') {
    throw new Error('buildRegisterPayload called without a registration category.');
  }
  if (values.specialty === '') throw new Error('buildRegisterPayload called without a specialty.');
  if (values.region === '') throw new Error('buildRegisterPayload called without a region.');
  if (values.operationalEmail === null) {
    throw new Error('buildRegisterPayload called without an email-delivery choice.');
  }

  const officePhone = values.officePhone.trim();
  const businessPhone = values.businessPhone.trim();
  const specialtyOther = values.specialtyOther.trim();
  const wantsOther = isOtherSpecialty(values.registrationCategory, values.specialty);

  const isEmployee = values.standing === 'employee';
  if (isEmployee && values.companyPosition === '') {
    throw new Error('buildRegisterPayload called for an employee without a company position.');
  }

  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    standing: values.standing,
    companyName: values.companyName.trim(),
    ...(isEmployee ? { companyPosition: values.companyPosition as CompanyPosition } : {}),
    email: values.email.trim(),
    // One credential or the other, never both. The server marks the two password fields
    // `forbidden()` alongside a Google token, so sending them empty would fail the whole request.
    ...(values.googleIdToken === null
      ? { password: values.password, confirmPassword: values.confirmPassword }
      : { googleIdToken: values.googleIdToken }),
    registrationCategory: values.registrationCategory,
    specialty: values.specialty,
    ...(wantsOther && specialtyOther ? { specialtyOther } : {}),
    ...(values.specialty === DRILLING_SPECIALTY && values.drillingTypes.length > 0
      ? { drillingTypes: values.drillingTypes }
      : {}),
    city: values.city.trim(),
    ...(values.place === null ? {} : { place: values.place }),
    region: values.region,
    ...(!isEmployee && officePhone ? { officePhone } : {}),
    ...(businessPhone ? { businessPhone } : {}),
    ...(isEmployee ? {} : { availability: values.availability }),
    acceptedTerms: true,
    operationalEmail: values.operationalEmail,
  };
};
