import { useCallback, useMemo, useState } from 'react';

import type { Availability, Region, Trade } from '../../api/types';
import type { CompletedWorkEntry, EquipmentCode, ProfileView } from './profileModel';

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
  specialties: readonly Trade[];
  specialtyOther: string;
  equipment: readonly EquipmentCode[];
  /** `''` while the server holds no answer yet, so nothing is defaulted on the person's behalf. */
  availability: Availability | '';
  city: string;
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
  specialties: profile.specialties,
  specialtyOther: profile.specialtyOther,
  equipment: [],
  availability: profile.availability ?? '',
  city: profile.city,
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

  const toggleSpecialty = useCallback((code: Trade, on: boolean): void => {
    setValues((prev) => ({ ...prev, specialties: toggle(prev.specialties, code, on) }));
  }, []);

  const toggleEquipment = useCallback((code: EquipmentCode, on: boolean): void => {
    setValues((prev) => ({ ...prev, equipment: toggle(prev.equipment, code, on) }));
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

  const flags = useMemo(
    () => ({
      // The free-text box and the equipment picker are revealed by the value the form already
      // holds, rather than by a CSS :has() reading the DOM back.
      showOther: values.specialties.includes('other'),
      showEquipment: values.specialties.includes('heavy_equipment'),
      // Travel distance stops being a meaningful preference once the work area is the country.
      nationwide: values.region === 'nationwide',
    }),
    [values.specialties, values.region],
  );

  return {
    values, setValue, touched, markTouched, toggleSpecialty, toggleEquipment,
    removeWork, setWork, reset, flags,
  };
};
