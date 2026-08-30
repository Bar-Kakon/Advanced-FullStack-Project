import type { Availability } from '../companies/company.model.js';
import type { Region, RegistrationCategory, Specialty } from '../users/user.model.js';
import type { RelationshipState } from '../connections/relationship.service.js';
import type { StructuredPlace } from '../location/place.types.js';

/**
 * What Browse renders on one card. Everything a viewer is not entitled to see is absent from the
 * type, so a projection cannot leak it by forgetting to strip it.
 */
export interface ContractorSummaryDto {
  readonly userId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly companyName: string | null;
  /** Which of the three routes this account registered through. A card is never assumed to be a
   *  contractor. */
  readonly registrationCategory: RegistrationCategory;
  readonly specialties: readonly Specialty[];
  readonly specialtyOther: string | null;
  readonly city: string | null;
  readonly region: Region | null;
  readonly avatarUrl: string | null;
  readonly availability: Availability | null;
  readonly relationship: RelationshipState;
  /** `null` until enough history exists. Never rendered, or filtered, as zero. */
  readonly rating: { readonly average: number; readonly count: number } | null;
  /** Always `null` today: no approved arithmetic exists, so no number is invented. */
  readonly flexibility: null;
  /** Road distance from the search origin, when a driving-distance filter was applied. */
  readonly drivingDistanceMeters: number | null;
}

export interface PublicWorkEntryDto {
  readonly id: string;
  readonly title: string;
  readonly scope: string | null;
  readonly meta: string;
  readonly onFieldSync: boolean;
  readonly imageUrl: string | null;
}

/**
 * The embedded Public Profile. It extends the card rather than duplicating it, so a field cannot
 * mean one thing in a list and another on a profile.
 */
export interface PublicProfileDto extends ContractorSummaryDto {
  readonly bio: string | null;
  readonly companyPosition: string | null;
  readonly travelRadiusKm: number | null;
  readonly basePlace: StructuredPlace | null;
  readonly approvedTravelLocations: readonly StructuredPlace[];
  readonly schedulingPrefs: {
    readonly delayToleranceDays: number | null;
    readonly noticeRequiredDays: number | null;
  };
  readonly work: readonly PublicWorkEntryDto[];
  /** D15. Absent unless the viewer is entitled; never a fallback from one number to the other. */
  readonly phones: PublicPhonesDto;
  /** Backend-decided. React must not offer a rating this says is not available. */
  readonly rateable: RateabilityDto;
  readonly isSelf: boolean;
}

export interface PublicPhonesDto {
  readonly officePhone: string | null;
  readonly businessPhone: string | null;
  /** Why the numbers are absent, so a screen can explain rather than showing a blank. */
  readonly visibility: PhoneVisibilityReason;
}

/**
 * `hidden_no_approved_case` is the current default: the approved automatic cases need Projects and
 * Work Commitments, which are unbuilt, and the professional's own control has no storage yet.
 */
export const PHONE_VISIBILITY_REASONS = [
  'self',
  'visible_shared_project_role',
  'visible_work_commitment',
  'hidden_no_approved_case',
] as const;
export type PhoneVisibilityReason = (typeof PHONE_VISIBILITY_REASONS)[number];

export interface RateabilityDto {
  readonly canRate: boolean;
  readonly reason: RateabilityReason;
}

/** `no_shared_completed_task` is what every viewer gets until the Tasks domain exists. */
export const RATEABILITY_REASONS = ['self', 'no_shared_completed_task', 'eligible'] as const;
export type RateabilityReason = (typeof RATEABILITY_REASONS)[number];

export interface BrowsePageDto {
  readonly contractors: readonly ContractorSummaryDto[];
  /** `null` at the end of the list. A client stops when it is null, never on an empty page. */
  readonly nextCursor: string | null;
  /** True when a driving-distance filter could not be fully evaluated by the routing service. */
  readonly distanceFilterDegraded: boolean;
}