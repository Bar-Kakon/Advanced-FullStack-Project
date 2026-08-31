import type { Availability } from '../companies/company.model.js';
import type { CompanyPosition, CompanyStanding } from '../companies/companyMembership.model.js';
import type {
  DrillingType,
  HeavyEquipment,
  Region,
  RegistrationCategory,
  Specialty,
} from './user.model.js';
import type { FlexibilityView } from '../flexibility/flexibility.service.js';
import type { StructuredPlace } from '../location/place.types.js';

export interface WorkEntryDto {
  readonly id: string;
  readonly title: string;
  readonly scope?: string;
  readonly meta: string;
  /** The `Completed on Blokta` badge. Server-derived, and only ever true for proved work. */
  readonly onFieldSync: boolean;
  /** Path to this API's own asset route, or `null`. Never a storage path. */
  readonly imageUrl: string | null;
}

/**
 * The only user shape the profile routes put on the wire, assembled key by key from three
 * documents so that no hash, token, permission list or Mongoose internal can ride along.
 */
export interface ProfileDto {
  readonly firstName: string;
  readonly lastName: string;
  readonly email: string;
  readonly language: 'he' | 'en';
  readonly profileComplete: boolean;

  readonly bio: string;
  /** The route this account registered through. Read-only here: it is not a profile field. */
  readonly registrationCategory: RegistrationCategory;
  readonly specialties: readonly Specialty[];
  readonly specialtyOther: string;
  /** Empty unless `heavy_equipment` is one of the specialties, which is what the server enforces. */
  readonly heavyEquipment: readonly HeavyEquipment[];
  /** Empty unless `drilling` is one of the specialties, enforced the same way. */
  readonly drillingTypes: readonly DrillingType[];
  /** The Step 2 answer. Changing it needs a Notification Settings screen, which does not exist. */
  readonly operationalEmail: boolean;
  readonly businessPhone: string;
  readonly city: string;
  readonly region: Region | null;
  /**
   * The structured place behind `city`, when one was ever chosen. `null` for a legacy account that
   * only has free text — no Place ID is invented for it, and `city`/`region` stay authoritative
   * for display either way.
   */
  readonly place: StructuredPlace | null;
  readonly travelRadiusKm: number | null;
  readonly delayToleranceDays: number | null;
  readonly noticeRequiredDays: number | null;
  readonly avatarUrl: string | null;

  /** Resolved from the company, never mirrored onto the user. `null` when there is no company. */
  readonly companyName: string | null;
  readonly officePhone: string | null;
  readonly availability: Availability | null;

  /** Descriptive only. Neither value grants anything. */
  readonly standing: CompanyStanding | null;
  readonly companyPosition: CompanyPosition | null;
  /** Whether the viewer's own company relationship is live yet. Not a permission. */
  readonly companyMembershipActive: boolean;

  /** Cold start: no rating domain exists, so these are honestly empty rather than invented. */
  readonly rating: null;
  readonly flexibility: FlexibilityView | null;
  readonly ratings: readonly never[];

  readonly work: readonly WorkEntryDto[];
}
