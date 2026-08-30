/**
 * The Flexibility Score, as a pure function of resolved coordination outcomes.
 *
 * Nothing here reads a database or a request. The evidence arrives through
 * `CoordinationOutcomePort`, so the arithmetic can be exercised in full while the proposal domain
 * that will feed it is still unbuilt.
 */

/** גמישות בזמנים and גמישות בסדר גודל של העבודה. They are scored separately, never merged. */
export const FLEXIBILITY_DIMENSIONS = ['schedule', 'scope'] as const;
export type FlexibilityDimension = (typeof FLEXIBILITY_DIMENSIONS)[number];

/**
 * How one coordination event actually ended. Only resolved outcomes exist here — a proposal still
 * waiting on somebody is not an outcome and never reaches this module.
 *
 * The four agreed outcomes carry the same weight. A counter is not worth less than an acceptance:
 * both kept the work, which is what flexibility measures.
 */
export const COORDINATION_OUTCOMES = [
  'accepted',
  'counter_agreed',
  'alternative_agreed',
  'other_solution_agreed',
  'declined_justified',
  'unresolved_replaced',
] as const;
export type CoordinationOutcome = (typeof COORDINATION_OUTCOMES)[number];

const AGREED: readonly CoordinationOutcome[] = [
  'accepted',
  'counter_agreed',
  'alternative_agreed',
  'other_solution_agreed',
];

export const isWorkableResolution = (outcome: CoordinationOutcome): boolean =>
  AGREED.includes(outcome);

/**
 * A justified decline is excluded from the score entirely — numerator and denominator both. Sitting
 * in the denominator alone would lower the score, which is the thing the closed rule forbids.
 *
 * What counts as justified is decided by the approved domain reasons and supplied by the evidence
 * source. This module never inspects a reason and holds no list of its own.
 */
export const isScoreRelevant = (outcome: CoordinationOutcome): boolean =>
  outcome !== 'declined_justified';

export interface CoordinationEvent {
  readonly dimension: FlexibilityDimension;
  readonly outcome: CoordinationOutcome;
  /** Context only. It never changes the arithmetic. */
  readonly requestedByCounterparty: boolean;
  /** Days of warning before the affected date. `null` when the source cannot say. Context only. */
  readonly noticeDays: number | null;
}

/**
 * Counts, and nothing else. Every field is an integer describing this contractor's own aggregate
 * behaviour, so no name, project, counterparty, date or negotiation can travel with it.
 */
export interface FlexibilityContextCounts {
  readonly events: number;
  readonly workableResolutions: number;
  readonly directAcceptances: number;
  readonly alternativesAgreed: number;
  readonly unresolvedFailures: number;
  readonly justifiedDeclines: number;
  readonly changesRequestedByCounterparty: number;
  readonly changesRequestedBySelf: number;
  readonly withAdvanceNotice: number;
  readonly noticeUnknown: number;
}

export interface FlexibilityDimensionScore {
  readonly score: number;
  readonly context: FlexibilityContextCounts;
}

export interface FlexibilityScore {
  /** `null` when no resolved score-relevant event exists. Never zero, which would be a claim. */
  readonly schedule: FlexibilityDimensionScore | null;
  /** `null` while no scope-change evidence exists in the model at all. */
  readonly scope: FlexibilityDimensionScore | null;
}

const SCORE_SCALE = 100;

const countsFor = (events: readonly CoordinationEvent[]): FlexibilityContextCounts => {
  const relevant = events.filter((event) => isScoreRelevant(event.outcome));

  return {
    events: relevant.length,
    workableResolutions: relevant.filter((event) => isWorkableResolution(event.outcome)).length,
    directAcceptances: relevant.filter((event) => event.outcome === 'accepted').length,
    alternativesAgreed: relevant.filter(
      (event) => isWorkableResolution(event.outcome) && event.outcome !== 'accepted',
    ).length,
    unresolvedFailures: relevant.filter((event) => event.outcome === 'unresolved_replaced').length,
    justifiedDeclines: events.filter((event) => event.outcome === 'declined_justified').length,
    changesRequestedByCounterparty: relevant.filter((event) => event.requestedByCounterparty).length,
    changesRequestedBySelf: relevant.filter((event) => !event.requestedByCounterparty).length,
    withAdvanceNotice: relevant.filter((event) => event.noticeDays !== null && event.noticeDays > 0)
      .length,
    noticeUnknown: relevant.filter((event) => event.noticeDays === null).length,
  };
};

/**
 * Successful flexible resolutions over score-relevant resolved events, on a 0–100 scale.
 *
 * One qualifying event is enough to produce a score. There is no minimum sample size, and no ageing
 * or rolling window: the number moves when new resolved behaviour is recorded, never because time
 * passed.
 */
const scoreFor = (events: readonly CoordinationEvent[]): FlexibilityDimensionScore | null => {
  const context = countsFor(events);
  if (context.events === 0) return null;

  return {
    score: Math.round((SCORE_SCALE * context.workableResolutions) / context.events),
    context,
  };
};

export const computeFlexibility = (events: readonly CoordinationEvent[]): FlexibilityScore => ({
  schedule: scoreFor(events.filter((event) => event.dimension === 'schedule')),
  scope: scoreFor(events.filter((event) => event.dimension === 'scope')),
});
