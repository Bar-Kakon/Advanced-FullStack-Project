import type { PlanCode, PlanLimits, PlanPrice } from './plan.model.js';

const MB = 1024 * 1024;

/**
 * The seeded catalogue: the three tier definitions the pricing screen renders and every quota
 * check reads.
 *
 * Every number here is PROVISIONAL and each document carries `provisional: true` to say so. They
 * live in a collection rather than in this file at runtime, so changing a price is a data edit
 * rather than a deploy — this is only what a fresh database is seeded with.
 *
 * Reconciled against the approved static screen and `docs/database-design.html` on 2026-08-31:
 *
 *   - Visual simulations are GONE from every tier. They metered architectural visualization, which
 *     was removed from the product, so the limit, the weekly usage counter and the screen's usage
 *     strip go with it rather than becoming a disabled placeholder.
 *   - Version-history depth is GONE as a plan differentiator (owner decision). Work plans are
 *     append-only, so a per-tier retention ladder would have implied a deletion the product does
 *     not perform. `fileMaxBytes` is the only file limit that varies.
 *   - Active delegations are 1 / 5 / unlimited. The design document's field note says 1 / 10 /
 *     null, which predates the ladder rebuild; the rebuilt ladder and the approved screen both say
 *     5, and the newer wording wins.
 *   - `notificationDigest` was false on Basic, contradicting the closed tier rule: Free is blocking
 *     coverage, BASIC IS THE DIGEST, Premium is the digest plus timing controls. Corrected here,
 *     and `notificationTimingControls` added as the Premium half the ladder had no field for.
 */
export interface PlanSeed {
  readonly code: PlanCode;
  readonly sortOrder: number;
  readonly prices: readonly PlanPrice[];
  readonly limits: PlanLimits;
}

export const PLAN_CATALOGUE: readonly PlanSeed[] = [
  {
    code: 'free',
    sortOrder: 0,
    // A real product state, not the absence of one. Zero is stored rather than an empty list, so
    // the price row is present and the currency question is answered the same way on every tier.
    prices: [
      { currency: 'ILS', amountMinor: 0, taxIncluded: true },
      { currency: 'USD', amountMinor: 0, taxIncluded: false },
    ],
    limits: {
      activeProjects: 5,
      tasksPerProject: null,
      membersPerProject: null,
      connections: 50,
      fileMaxBytes: 10 * MB,
      auditRetentionDays: 30,
      activeDelegations: 1,
      moderatedThreads: false,
      muteControls: false,
      agreementForm: false,
      notificationDigest: false,
      notificationTimingControls: false,
      privateExecutionLayer: false,
      emailNotifications: false,
      supportTier: 'community',
    },
  },
  {
    code: 'basic',
    sortOrder: 1,
    prices: [
      { currency: 'ILS', amountMinor: 6000, taxIncluded: true },
      { currency: 'USD', amountMinor: 2000, taxIncluded: false },
    ],
    limits: {
      activeProjects: 25,
      tasksPerProject: null,
      membersPerProject: null,
      connections: 500,
      fileMaxBytes: 30 * MB,
      auditRetentionDays: 365,
      activeDelegations: 5,
      moderatedThreads: true,
      muteControls: true,
      agreementForm: false,
      notificationDigest: true,
      notificationTimingControls: false,
      privateExecutionLayer: false,
      emailNotifications: true,
      supportTier: 'email',
    },
  },
  {
    code: 'premium',
    sortOrder: 2,
    prices: [
      { currency: 'ILS', amountMinor: 10_500, taxIncluded: true },
      { currency: 'USD', amountMinor: 3500, taxIncluded: false },
    ],
    limits: {
      activeProjects: 100,
      tasksPerProject: null,
      membersPerProject: null,
      connections: null,
      fileMaxBytes: 30 * MB,
      auditRetentionDays: null,
      activeDelegations: null,
      moderatedThreads: true,
      muteControls: true,
      agreementForm: true,
      notificationDigest: true,
      notificationTimingControls: true,
      privateExecutionLayer: true,
      emailNotifications: true,
      supportTier: 'priority',
    },
  },
];

/** Where an account with no subscription document sits, which is a state and never an error. */
export const DEFAULT_PLAN_CODE: PlanCode = 'free';

export const seedForCode = (code: PlanCode): PlanSeed => {
  const seed = PLAN_CATALOGUE.find((plan) => plan.code === code);
  if (seed === undefined) throw new Error(`No catalogue entry for plan ${code}.`);
  return seed;
};
