/**
 * What this feature is allowed to ask about subscription plans, and the whole of it.
 *
 * Declared here and implemented in `billing`, so the dependency points inwards: projects states a
 * need, billing satisfies it, and nothing in this folder learns what a tier is called or what the
 * catalogue holds. It is deliberately not a general "read the plan" hook — the one question a
 * project creation has is whether there is room for another one.
 */
export interface PlanCapacityPort {
  /** `true` when one more owned project is within the plan governing this company. */
  mayOpenAnotherProject(companyId: string): Promise<boolean>;
}
