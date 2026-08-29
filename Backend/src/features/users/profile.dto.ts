import type { Availability } from '../companies/company.model.js';
import type { CompanyPosition, CompanyStanding } from '../companies/companyMembership.model.js';
import type { Region, Trade } from './user.model.js';

export interface WorkEntryDto {
  readonly id: string;
  readonly title: string;
  readonly scope?: string;
  readonly meta: string;
  /** The `Completed on FieldSync` badge. Server-derived, and only ever true for proved work. */
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
  readonly specialties: readonly Trade[];
  readonly specialtyOther: string;
  readonly businessPhone: string;
  readonly city: string;
  readonly region: Region | null;
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
  readonly flexibility: null;
  readonly ratings: readonly never[];

  readonly work: readonly WorkEntryDto[];
}
