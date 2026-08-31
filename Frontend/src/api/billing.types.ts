/** Mirrored from `Backend/src/features/billing/billing.dto.ts`. */

export const PLAN_CODES = ['free', 'basic', 'premium'] as const;
export type PlanCode = (typeof PLAN_CODES)[number];

export type SupportTier = 'community' | 'email' | 'priority';

export interface PlanPrice {
  readonly currency: string;
  readonly amountMinor: number;
  readonly taxIncluded: boolean;
}

/** `null` means unlimited on every numeric limit, and the screen renders it as such. */
export interface PlanLimits {
  readonly activeProjects: number | null;
  readonly tasksPerProject: number | null;
  readonly membersPerProject: number | null;
  readonly connections: number | null;
  readonly fileMaxBytes: number;
  readonly auditRetentionDays: number | null;
  readonly activeDelegations: number | null;
  readonly moderatedThreads: boolean;
  readonly muteControls: boolean;
  readonly agreementForm: boolean;
  readonly notificationDigest: boolean;
  readonly privateExecutionLayer: boolean;
  readonly emailNotifications: boolean;
  readonly supportTier: SupportTier;
}

export interface Plan {
  readonly code: PlanCode;
  readonly sortOrder: number;
  readonly prices: readonly PlanPrice[];
  readonly interval: 'month';
  readonly limits: PlanLimits;
  readonly provisional: boolean;
}

export type SubscriptionStatus = 'active' | 'past_due' | 'canceled' | 'expired';

/**
 * No provider id, no customer id and no amount. The screen needs the tier, the dates and whether a
 * change is pending; a provider identifier is not something to hand around a browser.
 */
export interface Subscription {
  readonly planCode: PlanCode;
  readonly status: SubscriptionStatus;
  readonly currentPeriodStart: string;
  readonly currentPeriodEnd: string;
  readonly cancelAtPeriodEnd: boolean;
  readonly scheduledPlanCode: PlanCode | null;
}

export interface CurrentPlan {
  readonly planCode: PlanCode;
  readonly limits: PlanLimits | null;
  /** `null` on Free, which is a real state and never an error: it buys nothing and records nothing. */
  readonly subscription: Subscription | null;
  /** Whether the deployment can open a checkout at all. No control is drawn when it cannot. */
  readonly checkoutAvailable: boolean;
}

export interface PlansResponse {
  readonly plans: readonly Plan[];
}

export interface CheckoutResponse {
  readonly redirectUrl: string;
}