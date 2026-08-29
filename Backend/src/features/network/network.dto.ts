import type { ContractorSummaryDto } from '../browse/publicProfile.dto.js';

/**
 * The four groups My Network renders. `blocked` is not a connection state — it is a separate
 * collection (D19) — so it is a group here and never a value the connection edge can hold.
 */
export const NETWORK_GROUPS = ['connected', 'incoming', 'outgoing'] as const;
export type NetworkGroup = (typeof NETWORK_GROUPS)[number];

/**
 * One row. The person is the same `ContractorSummaryDto` Browse renders, so a field cannot mean
 * one thing on a Browse card and another on a My Network row.
 */
export interface NetworkRowDto {
  readonly person: ContractorSummaryDto;
  /** When the edge reached its current state: accepted for `connected`, requested for the rest. */
  readonly since: string;
}

export interface NetworkPageDto {
  readonly rows: readonly NetworkRowDto[];
  /** `null` at the end of the list. A client stops on null, never on an empty page. */
  readonly nextCursor: string | null;
}

export interface BlockedRowDto {
  readonly person: ContractorSummaryDto;
  readonly blockedAt: string;
}

export interface BlockedPageDto {
  readonly rows: readonly BlockedRowDto[];
  readonly nextCursor: string | null;
}
