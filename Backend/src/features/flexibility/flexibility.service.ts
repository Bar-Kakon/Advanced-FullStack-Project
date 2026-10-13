import type { CoordinationOutcomePort } from './coordinationOutcome.port.js';
import {
  classifyFlexibility,
  computeFlexibility,
  type FlexibilityCategory,
  type FlexibilityContextCounts,
} from './flexibility.js';

/**
 * What a surface renders. `score` is 0–100, `category` is its one canonical verbal classification,
 * and `context` carries only this contractor's own aggregate counts, so nothing identifying can
 * reach a viewer through it.
 */
export interface FlexibilityDto {
  readonly score: number;
  readonly category: FlexibilityCategory;
  readonly context: FlexibilityContextCounts;
}

export interface FlexibilityView {
  readonly schedule: FlexibilityDto | null;
}

export interface FlexibilityService {
  forUser(userId: string): Promise<FlexibilityView | null>;
}

/**
 * Derived on read from authoritative outcomes, and stored nowhere. There is no field a client
 * could submit and no endpoint that accepts one, which is what makes the number unforgeable.
 */
export const createFlexibilityService = (
  outcomes: CoordinationOutcomePort,
): FlexibilityService => ({
  async forUser(userId) {
    const events = await outcomes.eventsFor(userId);
    const computed = computeFlexibility(events);

    if (computed.schedule === null) return null;
    return {
      schedule: { ...computed.schedule, category: classifyFlexibility(computed.schedule.score) },
    };
  },
});
