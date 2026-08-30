import { useCallback, useMemo, useState } from 'react';

import {
  DRILLING_SPECIALTY,
  OTHER_SPECIALTY,
  type Availability,
  type DrillingType,
  type Region,
  type RegistrationCategory,
  type Specialty,
} from '../../api/types';
import type { CompletedWorkEntry, EquipmentCode, ProfileView } from './profileModel';
import type { StructuredPlace } from '../../location/place.types';

/**
 * Everything Edit profile holds while it is being edited.
 *
 * There is deliberately **no `phone` field**. The personal / login number is never professional
 * profile-display data (D15), Register has never asked for it, and the prototype's `phone` box —
 * with its hint saying it was shown to connections — described a rule the product no longer has.
 * `officePhone` and `businessPhone` replace it as two independent optional values on two
 * different documents, with no fallback between them in either direction.
 */
export interface EditProfileValues {
  firstName: string;
  lastName: string;
  companyName: string;
  officePhone: string;
  businessPhone: string;
  bio: string;
  /** Read-only here. The route was fixed at registration and this screen never changes it. */
  registrationCategory: RegistrationCategory;
  specialties: readonly Specialty[];
  specialtyOther: string;
  equipment: readonly EquipmentCode[];
  drillingTypes: readonly DrillingType[];
  /** `''` while the server holds no answer yet, so nothing is defaulted on the person's behalf. */
  availability: Availability | '';
  city: string;
  place: StructuredPlace | null;
  region: Region | '';
  travelRadiusKm: string;
  delayToleranceDays: string;
  noticeRequiredDays: string;
  /** Editable here: the approved edit screen carries a manager, not a read-only list. */
  work: readonly CompletedWorkEntry[];
}

export type EditProfileField = keyof EditProfileValues;

/**
 * Numbers are held as the strings the boxes contain, so a half-typed value is not coerced. An
 * absent value becomes an empty box, never a zero or a guess.
 */
const numberBox = (value: number | null): string => (value === null ? '' : String(value));

export const fromProfile = (profile: ProfileView): EditProfileValues => ({
  firstName: profile.firstName,
  lastName: profile.lastName,
  companyName: profile.companyName ?? '',
  officePhone: profile.officePhone ?? '',
  businessPhone: profile.businessPhone ?? '',
  bio: profile.bio,
  registrationCategory: profile.registrationCategory,
  specialties: profile.specialties,
  specialtyOther: profile.specialtyOther,
  equipment: profile.heavyEquipment,
  drillingTypes: profile.drillingTypes,
  availability: profile.availability ?? '',
  city: profile.city,
  place: profile.place,
  region: profile.region ?? '',
  travelRadiusKm: numberBox(profile.travelRadiusKm),
  delayToleranceDays: numberBox(profile.delayToleranceDays),
  noticeRequiredDays: numberBox(profile.noticeRequiredDays),
  work: profile.work,
});

const toggle = <T,>(list: readonly T[], item: T, on: boolean): readonly T[] =>
  on ? (list.includes(item) ? list : [...list, item]) : list.filter((entry) => entry !== item);

export const useEditProfileForm = (initial: EditProfileValues) => {
  const [values, setValues] = useState<EditProfileValues>(initial);
  const [touched, setTouched] = useState<Partial<Record<EditProfileField, boolean>>>({});

  const setValue = useCallback(<K extends EditProfileField>(field: K, value: EditProfileValues[K]): void => {
    setValues((prev) => (prev[field] === value ? prev : { ...prev, [field]: value }));
  }, []);

  const markTouched = useCallback((field: EditProfileField): void => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }));
  }, []);

  const toggleSpecialty = useCallback((code: Specialty, on: boolean): void => {
    setValues((prev) => ({ ...prev, specialties: toggle(prev.specialties, code, on) }));
  }, []);

  const toggleEquipment = useCallback((code: EquipmentCode, on: boolean): void => {
    setValues((prev) => ({ ...prev, equipment: toggle(prev.equipment, code, on) }));
  }, []);

  const toggleDrillingType = useCallback((code: DrillingType, on: boolean): void => {
    setValues((prev) => ({ ...prev, drillingTypes: toggle(prev.drillingTypes, code, on) }));
  }, []);

  const removeWork = useCallback((id: string): void => {
    setValues((prev) => ({ ...prev, work: prev.work.filter((entry) => entry.id !== id) }));
  }, []);

  const setWork = useCallback((work: readonly CompletedWorkEntry[]): void => {
    setValues((prev) => ({ ...prev, work }));
  }, []);

  const reset = useCallback((next: EditProfileValues): void => {
    setValues(next);
    setTouched({});
  }, []);

  /** The required fields, checked here so Save can be blocked before any request is built. */
  const missing = useMemo(
    () => ({
      firstName: values.firstName.trim() === '',
      lastName: values.lastName.trim() === '',
      companyName: values.companyName.trim() === '',
      location: values.place === null && values.city.trim() === '',
      region: values.region === '',
    }),
    [values.firstName, values.lastName, values.companyName, values.place, values.city, values.region],
  );

  const isValid = !Object.values(missing).some(Boolean);

  const markAllTouched = useCallback((): void => {
    setTouched({
      firstName: true, lastName: true, companyName: true, city: true, place: true, region: true,
    });
  }, []);

  const flags = useMemo(
    () => ({
      // The free-text box and the equipment picker are revealed by the value the form already
      // holds, rather than by a CSS :has() reading the DOM back.
      showOther: values.specialties.includes(OTHER_SPECIALTY[values.registrationCategory]),
      showEquipment: values.specialties.includes('heavy_equipment'),
      showDrillingTypes: values.specialties.includes(DRILLING_SPECIALTY),
      // Travel distance stops being a meaningful preference once the work area is the country.
      nationwide: values.region === 'nationwide',
    }),
    [values.specialties, values.registrationCategory, values.region],
  );

  return {
    values, setValue, touched, markTouched, markAllTouched, toggleSpecialty, toggleEquipment,
    toggleDrillingType, removeWork, setWork, reset, flags, missing, isValid,
  };
};
