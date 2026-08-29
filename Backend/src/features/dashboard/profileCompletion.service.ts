import type { CompanyRecord } from '../companies/company.model.js';
import type { UserProfileRecord } from '../users/user.model.js';
import type { ProfileReminderItemDto } from './dashboard.dto.js';

export interface ProfileCompletionInput {
  readonly user: UserProfileRecord;
  readonly company: CompanyRecord | null;
  readonly canManageCompany: boolean;
  readonly completedWorkCount: number;
}

const hasText = (value: string | undefined): boolean =>
  typeof value === 'string' && value.trim().length > 0;

export const missingProfileItems = ({
  user,
  company,
  canManageCompany,
  completedWorkCount,
}: ProfileCompletionInput): ProfileReminderItemDto[] => {
  const items: ProfileReminderItemDto[] = [];

  const contactRoutes = [user.email, user.businessPhone, company?.officePhone];
  if (!contactRoutes.some((route) => hasText(route))) {
    items.push({ key: 'contactRoute', importance: 'required' });
  }

  if ((user.specialties ?? []).length === 0) {
    items.push({ key: 'specialties', importance: 'required' });
  }

  if (user.location?.region === undefined) {
    items.push({ key: 'region', importance: 'required' });
  }

  if (user.location?.place === undefined) {
    items.push({ key: 'structuredPlace', importance: 'suggested' });
  }

  if (user.location?.region !== 'nationwide' && user.location?.travelRadiusKm === undefined) {
    items.push({ key: 'travelRadius', importance: 'suggested' });
  }

  if (!hasText(user.bio)) items.push({ key: 'bio', importance: 'suggested' });
  if (user.avatar?.fileId === undefined) items.push({ key: 'avatar', importance: 'suggested' });
  if (!hasText(user.businessPhone)) items.push({ key: 'businessPhone', importance: 'suggested' });

  if (canManageCompany && company !== null && !hasText(company.officePhone)) {
    items.push({ key: 'officePhone', importance: 'suggested' });
  }

  const prefs = user.schedulingPrefs;
  if (prefs?.delayToleranceDays === undefined || prefs.noticeRequiredDays === undefined) {
    items.push({ key: 'schedulingPrefs', importance: 'suggested' });
  }

  if (completedWorkCount === 0) items.push({ key: 'completedWork', importance: 'suggested' });

  return items;
};

export const reminderIsDismissed = (
  missingKeys: readonly string[],
  dismissedKeys: readonly string[] | null,
): boolean => dismissedKeys !== null && missingKeys.every((key) => dismissedKeys.includes(key));