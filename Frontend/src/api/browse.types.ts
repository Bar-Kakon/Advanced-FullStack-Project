import type { StructuredPlace } from '../location/place.types';
import type {
  Availability,
  CompanyPosition,
  Region,
  RegistrationCategory,
  Specialty,
} from './types';

/** The four Browse states, mirrored from `relationship.service.ts`. Blocked is never among them. */
export const RELATIONSHIP_STATES = [
  'none', 'outgoing_request', 'incoming_request', 'connected',
] as const;
export type RelationshipState = (typeof RELATIONSHIP_STATES)[number];

export type { StructuredPlace } from '../location/place.types';

export interface ContractorSummary {
  readonly userId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly companyName: string | null;
  /** The route this account registered through. A card is never assumed to be a contractor. */
  readonly registrationCategory: RegistrationCategory;
  readonly specialties: readonly Specialty[];
  readonly specialtyOther: string | null;
  readonly city: string | null;
  readonly region: Region | null;
  readonly avatarUrl: string | null;
  readonly availability: Availability | null;
  readonly relationship: RelationshipState;
  /** `null` until enough history exists. Rendered as `—`, never as zero. */
  readonly rating: { readonly average: number; readonly count: number } | null;
  /** Always `null`: no approved arithmetic exists, so no number is invented. */
  readonly flexibility: null;
  readonly drivingDistanceMeters: number | null;
}

export interface PublicWorkEntry {
  readonly id: string;
  readonly title: string;
  readonly scope: string | null;
  readonly meta: string;
  readonly onFieldSync: boolean;
  readonly imageUrl: string | null;
}

export type PhoneVisibilityReason =
  | 'self'
  | 'visible_shared_project_role'
  | 'visible_work_commitment'
  | 'hidden_no_approved_case';

export type RateabilityReason = 'self' | 'no_shared_completed_task' | 'eligible';

export interface PublicProfile extends ContractorSummary {
  readonly bio: string | null;
  readonly companyPosition: CompanyPosition | null;
  readonly travelRadiusKm: number | null;
  readonly basePlace: StructuredPlace | null;
  readonly approvedTravelLocations: readonly StructuredPlace[];
  readonly schedulingPrefs: {
    readonly delayToleranceDays: number | null;
    readonly noticeRequiredDays: number | null;
  };
  readonly work: readonly PublicWorkEntry[];
  readonly phones: {
    readonly officePhone: string | null;
    readonly businessPhone: string | null;
    readonly visibility: PhoneVisibilityReason;
  };
  readonly rateable: { readonly canRate: boolean; readonly reason: RateabilityReason };
  readonly isSelf: boolean;
}

export interface BrowsePage {
  readonly contractors: readonly ContractorSummary[];
  /** `null` at the end. A client stops on null, never on an empty page. */
  readonly nextCursor: string | null;
  /** True when the routing service could not fully evaluate a driving-distance filter. */
  readonly distanceFilterDegraded: boolean;
}

/**
 * The two location filters are separate on purpose. `approvedPlaceId` asks whether a contractor
 * said they will work in a place; `originPlaceId` + `maxDrivingKm` ask how far they are by road.
 */
/**
 * The orders the server can actually produce. There is no flexibility order, because D6 has no
 * arithmetic and a sort would be inventing the score.
 */
export const BROWSE_SORTS = ['relevance', 'rating_desc'] as const;
export type BrowseSort = (typeof BROWSE_SORTS)[number];

export interface BrowseFilters {
  readonly sort: BrowseSort;
  readonly q: string;
  /** Which registration routes to search. Empty searches all three. */
  readonly categories: readonly RegistrationCategory[];
  readonly specialties: readonly Specialty[];
  readonly regions: readonly Region[];
  readonly availability: readonly Availability[];
  readonly approvedPlace: StructuredPlace | null;
  readonly origin: StructuredPlace | null;
  readonly maxDrivingKm: number | null;
  /** A floor on the average a contractor has been given. `null` means no minimum at all. */
  readonly minRating: number | null;
}

export const emptyBrowseFilters: BrowseFilters = {
  sort: 'relevance',
  q: '',
  categories: [],
  specialties: [],
  regions: [],
  availability: [],
  approvedPlace: null,
  origin: null,
  maxDrivingKm: null,
  minRating: null,
};

export interface TravelCandidate extends StructuredPlace {
  readonly drivingDistanceMeters: number | null;
  readonly withinRadius: boolean;
  readonly routeStatus: 'ok' | 'no_route' | 'failed';
}

export interface TravelProposal {
  readonly origin: StructuredPlace;
  readonly travelRadiusKm: number;
  readonly suggested: readonly TravelCandidate[];
  readonly excluded: readonly TravelCandidate[];
  /** Rediscovered by Google, but removed before. Never pre-selected, however near it is. */
  readonly previouslyRemoved: readonly TravelCandidate[];
  /** True when a candidate could not be routed, so the proposal is known to be incomplete. */
  readonly partial: boolean;
}

export interface ApprovedTravelLocationPayload extends StructuredPlace {
  readonly source: 'suggested' | 'manual';
  readonly drivingDistanceMeters?: number;
}

export interface RemovedTravelLocationPayload {
  readonly placeId: string;
  readonly displayName: string;
}

/** The editor's own saved answers. `previouslyRemoved` is private to the person it belongs to. */
export interface MyTravelPreferences {
  readonly travelRadiusKm: number | null;
  readonly basePlace: StructuredPlace | null;
  readonly approvedTravelLocations: readonly ApprovedTravelLocationPayload[];
  readonly previouslyRemoved: readonly RemovedTravelLocationPayload[];
}