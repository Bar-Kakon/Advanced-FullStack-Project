import type { Profile, ReceivedRatingDto, WorkEntry } from '../../api/profile.api';

/**
 * What the two profile screens render. Every value comes from `GET /users/me`; nothing on these
 * screens is invented, defaulted or carried over from the static prototype.
 */
export type ProfileView = Profile;

export type CompletedWorkEntry = WorkEntry;

export { EQUIPMENT_CODES } from '../../api/types';
export type { EquipmentCode } from '../../api/types';

/** Month and year only. The exact date and the task context are withheld deliberately. */
export type ReceivedRating = ReceivedRatingDto;

/** Two letters for the avatar, taken from the person's own name rather than stored anywhere. */
export const initialsOf = (firstName: string, lastName: string): string =>
  `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`;

/** An asset route answers only to the owner's token, so an <img> needs the bytes fetched first. */
export const isOwnAssetUrl = (url: string | null): url is string =>
  url !== null && url.startsWith('/api/users/me/assets/');
