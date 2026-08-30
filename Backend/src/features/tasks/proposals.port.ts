/**
 * The seam the cascade will plug into.
 *
 * My Tasks shows a marker when a date-change proposal is waiting on the viewer. That domain is not
 * built, so the only implementation answers `null` for every task — meaning "not known", which the
 * screen renders as no marker at all. It never answers `false`, because that would be a claim that
 * nothing is waiting, and nobody has checked.
 */
export interface ProposalMarkerPort {
  pendingFor(userId: string, taskIds: readonly string[]): Promise<ReadonlyMap<string, boolean>>;
  /** Whether the domain behind this port exists yet. */
  readonly available: boolean;
}

export const unbuiltProposalMarkerPort: ProposalMarkerPort = {
  available: false,
  async pendingFor() {
    return new Map<string, boolean>();
  },
};
