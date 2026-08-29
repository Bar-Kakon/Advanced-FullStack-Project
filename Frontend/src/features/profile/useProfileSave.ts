import { useCallback, useState } from 'react';

import {
  classifyProfileError,
  updateMyCompany,
  updateMyProfile,
  type CompanyPatch,
  type Profile,
  type ProfilePatch,
  type ProfileFailure,
} from '../../api/profile.api';
import type { EditProfileValues } from './useEditProfileForm';

const trimmed = (value: string): string => value.trim();
const orNull = (value: string): string | null => (value.trim() === '' ? null : value.trim());
const orOmit = (value: string): number | undefined =>
  value.trim() === '' ? undefined : Number(value);

/** Only what actually changed is sent, so an untouched field is never rewritten with its own value. */
export const buildProfilePatch = (values: EditProfileValues, saved: Profile): ProfilePatch => {
  const patch: ProfilePatch = {};

  if (trimmed(values.firstName) !== saved.firstName) patch.firstName = trimmed(values.firstName);
  if (trimmed(values.lastName) !== saved.lastName) patch.lastName = trimmed(values.lastName);
  if (values.bio !== saved.bio) patch.bio = values.bio;
  if (trimmed(values.city) !== saved.city) patch.city = trimmed(values.city);
  if (values.region !== '' && values.region !== saved.region) patch.region = values.region;

  const specialtiesChanged =
    values.specialties.length !== saved.specialties.length
    || values.specialties.some((code) => !saved.specialties.includes(code));
  if (specialtiesChanged) patch.specialties = values.specialties;

  if (orNull(values.specialtyOther) !== (saved.specialtyOther || null)) {
    patch.specialtyOther = orNull(values.specialtyOther);
  }
  if (orNull(values.businessPhone) !== (saved.businessPhone || null)) {
    patch.businessPhone = orNull(values.businessPhone);
  }

  const radius = orOmit(values.travelRadiusKm);
  if (radius !== undefined && radius !== saved.travelRadiusKm) patch.travelRadiusKm = radius;

  const delay = orOmit(values.delayToleranceDays);
  if (delay !== undefined && delay !== saved.delayToleranceDays) patch.delayToleranceDays = delay;

  const notice = orOmit(values.noticeRequiredDays);
  if (notice !== undefined && notice !== saved.noticeRequiredDays) patch.noticeRequiredDays = notice;

  return patch;
};

export const buildCompanyPatch = (values: EditProfileValues, saved: Profile): CompanyPatch => {
  const patch: CompanyPatch = {};

  if (trimmed(values.companyName) !== (saved.companyName ?? '') && trimmed(values.companyName) !== '') {
    patch.name = trimmed(values.companyName);
  }
  if (orNull(values.officePhone) !== (saved.officePhone || null)) {
    patch.officePhone = orNull(values.officePhone);
  }
  if (values.availability !== '' && values.availability !== saved.availability) {
    patch.availability = values.availability;
  }

  return patch;
};

/**
 * Two documents, so two requests: the person's own fields and the company's. Each is sent only if
 * it has something to say, and the second answer is the one kept because it is the newer read.
 */
export const useProfileSave = () => {
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failure, setFailure] = useState<ProfileFailure | null>(null);

  const save = useCallback(
    async (values: EditProfileValues, current: Profile): Promise<Profile | null> => {
      setSaving(true);
      setFailure(null);
      setSaved(false);

      const profilePatch = buildProfilePatch(values, current);
      const companyPatch = buildCompanyPatch(values, current);

      try {
        let latest = current;
        if (Object.keys(profilePatch).length > 0) latest = await updateMyProfile(profilePatch);
        if (Object.keys(companyPatch).length > 0) latest = await updateMyCompany(companyPatch);

        setSaved(true);
        return latest;
      } catch (error) {
        setFailure(classifyProfileError(error));
        return null;
      } finally {
        setSaving(false);
      }
    },
    [],
  );

  return { save, saving, saved, failure, clearSaved: useCallback(() => setSaved(false), []) };
};
