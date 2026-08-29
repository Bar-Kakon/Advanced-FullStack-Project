/**
 * The one structured-place shape in the client, mirrored from the server's `StoredPlace`.
 *
 * Browse, Register and Edit profile all speak this type, so a place selected on one screen is the
 * same value everywhere and downstream driving-distance behaviour has the Place ID it needs.
 */
export interface StructuredPlace {
  readonly placeId: string;
  readonly displayName: string;
  readonly city?: string;
  readonly adminArea?: string;
  readonly latitude: number;
  readonly longitude: number;
}

/** What a legacy account has instead: free text and an enum, with no Place ID to be invented. */
export interface LegacyLocation {
  readonly city: string;
  readonly region: string | null;
}