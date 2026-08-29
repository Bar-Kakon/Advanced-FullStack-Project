import type { ContractorSummary } from './browse.types';

export const NETWORK_GROUPS = ['connected', 'incoming', 'outgoing'] as const;
export type NetworkGroup = (typeof NETWORK_GROUPS)[number];

/** Every tab on the screen, including the blocks group the connection endpoint does not serve. */
export const NETWORK_TABS = [...NETWORK_GROUPS, 'blocked'] as const;
export type NetworkTab = (typeof NETWORK_TABS)[number];

/** The person is the same shape Browse renders, so one field cannot mean two things. */
export interface NetworkRow {
  readonly person: ContractorSummary;
  readonly since: string;
}

export interface BlockedRow {
  readonly person: ContractorSummary;
  readonly blockedAt: string;
}

export interface NetworkPage {
  readonly rows: readonly NetworkRow[];
  readonly nextCursor: string | null;
}

export interface BlockedPage {
  readonly rows: readonly BlockedRow[];
  readonly nextCursor: string | null;
}
