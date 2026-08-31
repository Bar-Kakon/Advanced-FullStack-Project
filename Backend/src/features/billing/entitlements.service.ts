import type { PlanRepository } from './plan.repository.js';
import { DEFAULT_PLAN_CODE, seedForCode } from './planCatalogue.js';
import type {
  BooleanLimitKey,
  NumericLimitKey,
  PlanCode,
  PlanLimits,
  PlanRecord,
} from './plan.model.js';

/** What every other domain reads. It never sees a subscription, a price or a provider id. */
export interface Entitlements {
  readonly planCode: PlanCode;
  readonly limits: PlanLimits;
}

/**
 * The one boundary the rest of the product asks about plan access.
 *
 * It exists so that no repository or controller anywhere writes `user.planCode === 'premium'`. A
 * caller asks whether a capability is available or what a numeric ceiling is, and the tier, the
 * catalogue and the meaning of `null` stay behind this interface.
 *
 * It is deliberately NOT where project authorization lives. Full Authority, `project.edit` and
 * every other permission are relationships between a person and a project; a plan is a commercial
 * relationship between a person and FieldSync. Mixing them would let a purchase grant access to
 * somebody else's project.
 */
export interface EntitlementService {
  forUser(userId: string): Promise<Entitlements>;
  /** `null` means unlimited, and every caller has to handle it — that is the point of `null`. */
  limitFor(userId: string, key: NumericLimitKey): Promise<number | null>;
  mayUse(userId: string, key: BooleanLimitKey): Promise<boolean>;
  /** Whether one more would exceed the ceiling. `false` whenever the limit is unlimited. */
  wouldExceed(userId: string, key: NumericLimitKey, currentCount: number): Promise<boolean>;
}

/** The narrow read this service needs of a user, so it never depends on the whole user domain. */
export interface PlanCodeReader {
  findPlanCode(userId: string): Promise<PlanCode | null>;
}

export interface EntitlementDependencies {
  readonly plans: PlanRepository;
  readonly users: PlanCodeReader;
}

/**
 * The catalogue is seed data that changes rarely and is read on effectively every check, so it is
 * held in memory for a short while rather than fetched per request. The window is small enough
 * that a price edit is visible within a minute and long enough that a burst of checks costs one
 * query.
 */
const CATALOGUE_TTL_MS = 60_000;

export const createEntitlementService = ({
  plans,
  users,
}: EntitlementDependencies): EntitlementService => {
  let cached: { readonly at: number; readonly byCode: Map<PlanCode, PlanRecord> } | null = null;

  const catalogue = async (): Promise<Map<PlanCode, PlanRecord>> => {
    if (cached !== null && Date.now() - cached.at < CATALOGUE_TTL_MS) return cached.byCode;

    const rows = await plans.findActive();
    const byCode = new Map(rows.map((plan) => [plan.code, plan]));
    cached = { at: Date.now(), byCode };
    return byCode;
  };

  /**
   * Free is a real state reached three ways — never bought, downgraded, or lapsed — and none of
   * them is an error. An account with no plan code and a catalogue that has not been seeded both
   * fall back to the Free definition rather than failing a request that has nothing to do with
   * billing.
   */
  const entitlements = async (userId: string): Promise<Entitlements> => {
    const planCode = (await users.findPlanCode(userId)) ?? DEFAULT_PLAN_CODE;
    const plan = (await catalogue()).get(planCode);

    return { planCode, limits: plan?.limits ?? seedForCode(planCode).limits };
  };

  return {
    forUser: entitlements,

    async limitFor(userId, key) {
      return (await entitlements(userId)).limits[key];
    },

    async mayUse(userId, key) {
      return (await entitlements(userId)).limits[key];
    },

    async wouldExceed(userId, key, currentCount) {
      const limit = (await entitlements(userId)).limits[key];
      return limit !== null && currentCount >= limit;
    },
  };
};
