import type { PlanCode, PlanLimits, PlanRecord, SupportTier } from './plan.model.js';
import type { SubscriptionRecord, SubscriptionStatus } from './subscription.model.js';
import type { CurrentPlanView } from './subscription.service.js';

/**
 * One price row. Both amounts are quoted on different tax bases, so `taxIncluded` travels with
 * each rather than being stated once for the plan.
 */
export interface PlanPriceDto {
  readonly currency: string;
  readonly amountMinor: number;
  readonly taxIncluded: boolean;
}

/**
 * A tier, as the pricing screen reads it.
 *
 * No display name: the codes are language-neutral and the client translates them, which is what
 * keeps one catalogue serving a Hebrew and an English screen.
 */
export interface PlanDto {
  readonly code: PlanCode;
  readonly sortOrder: number;
  readonly prices: readonly PlanPriceDto[];
  readonly interval: 'month';
  readonly limits: PlanLimits;
  readonly provisional: boolean;
}

export interface SubscriptionDto {
  readonly planCode: PlanCode;
  readonly status: SubscriptionStatus;
  readonly currentPeriodStart: string;
  readonly currentPeriodEnd: string;
  readonly cancelAtPeriodEnd: boolean;
  readonly scheduledPlanCode: PlanCode | null;
}

export interface CurrentPlanDto {
  readonly planCode: PlanCode;
  readonly limits: PlanLimits | null;
  readonly subscription: SubscriptionDto | null;
  /** Whether the deployment can open a checkout. The screen renders an upgrade control only then. */
  readonly checkoutAvailable: boolean;
}

export const toPlanDto = (plan: PlanRecord): PlanDto => ({
  code: plan.code,
  sortOrder: plan.sortOrder,
  prices: plan.prices.map((price) => ({
    currency: price.currency,
    amountMinor: price.amountMinor,
    taxIncluded: price.taxIncluded,
  })),
  interval: plan.interval,
  limits: plan.limits,
  provisional: plan.provisional,
});

/**
 * Everything about the provider stays behind this mapper. No customer id, no subscription id and
 * no amount reaches the client: the screen needs the tier, the dates and whether a change is
 * pending, and a provider identifier is not an authorization token to be handed around.
 */
export const toSubscriptionDto = (subscription: SubscriptionRecord): SubscriptionDto => ({
  planCode: subscription.planCode,
  status: subscription.status,
  currentPeriodStart: subscription.currentPeriodStart.toISOString(),
  currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
  cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
  scheduledPlanCode: subscription.scheduledPlanCode,
});

export const toCurrentPlanDto = (view: CurrentPlanView): CurrentPlanDto => ({
  planCode: view.planCode,
  limits: view.plan?.limits ?? null,
  subscription: view.subscription === null ? null : toSubscriptionDto(view.subscription),
  checkoutAvailable: view.checkoutAvailable,
});

export type { PlanCode, PlanLimits, SupportTier };
