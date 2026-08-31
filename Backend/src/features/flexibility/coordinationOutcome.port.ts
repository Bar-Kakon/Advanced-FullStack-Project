import type { Types } from 'mongoose';

import type { CoordinationEvent } from './flexibility.js';

/**
 * Where resolved coordination outcomes come from.
 *
 * The proposal and reschedule domain that produces them is not built, so the only implementation
 * answers `available: false` and an empty list. That is "no evidence", not "no flexibility": the
 * score comes back `null` rather than zero, and every surface renders its own empty mark.
 *
 * **Attribution rule for whoever implements this.** A delegated task's outcome belongs to the
 * DELEGATOR, who remains the responsible party toward the project. Use `flexibilitySubjectOf`,
 * which reads the assignee and never the confidential delegate.
 */
export interface CoordinationOutcomePort {
  readonly available: boolean;
  eventsFor(userId: string): Promise<readonly CoordinationEvent[]>;
}

export const unbuiltCoordinationOutcomePort: CoordinationOutcomePort = {
  available: false,
  async eventsFor() {
    return [];
  },
};

/** The party a task's coordination outcome is attributed to: the responsible one, never the delegate. */
export const flexibilitySubjectOf = (task: {
  readonly assignee?: Types.ObjectId;
  readonly delegation?: { readonly delegate: Types.ObjectId };
}): Types.ObjectId | null => task.assignee ?? null;
