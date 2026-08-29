import type { Profile, ReceivedRatingDto, WorkEntry } from '../../api/profile.api';

/**
 * What the two profile screens render. Every value comes from `GET /users/me`; nothing on these
 * screens is invented, defaulted or carried over from the static prototype.
 */
export type ProfileView = Profile;

export type CompletedWorkEntry = WorkEntry;

/** D14's heavy-equipment half has no schema anywhere. These are the prototype's ten codes. */
export const EQUIPMENT_CODES = [
  'excavator', 'backhoe', 'drill_rig', 'mini_excavator', 'crawler',
  'jcb', 'wheel_loader', 'bobcat', 'bulldozer', 'hooklift_truck',
] as const;

export type EquipmentCode = (typeof EQUIPMENT_CODES)[number];

/** Month and year only. The exact date and the task context are withheld deliberately. */
export type ReceivedRating = ReceivedRatingDto;

/** Two letters for the avatar, taken from the person's own name rather than stored anywhere. */
export const initialsOf = (firstName: string, lastName: string): string =>
  `${firstName.trim().charAt(0)}${lastName.trim().charAt(0)}`;

/** An asset route answers only to the owner's token, so an <img> needs the bytes fetched first. */
export const isOwnAssetUrl = (url: string | null): url is string =>
  url !== null && url.startsWith('/api/users/me/assets/');
