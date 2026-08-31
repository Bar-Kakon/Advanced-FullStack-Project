import { Schema, model, type Types } from 'mongoose';

import { CURRENCIES, PLAN_CODES, type Currency, type PlanCode } from './plan.model.js';

/**
 * `canceled` still serves the person until `currentPeriodEnd`; `expired` is after it. Keeping the
 * two distinct is exactly what makes "cancel now, keep access until the period ends" expressible.
 */
export const SUBSCRIPTION_STATUSES = ['active', 'past_due', 'canceled', 'expired'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

/** PayPal is the approved provider. `none` is what a Free period carries: it buys nothing. */
export const BILLING_PROVIDERS = ['none', 'paypal'] as const;
export type BillingProviderName = (typeof BILLING_PROVIDERS)[number];

export interface SubscriptionRecord {
  readonly _id: Types.ObjectId;
  readonly user: Types.ObjectId;
  readonly plan: Types.ObjectId;
  readonly planCode: PlanCode;
  readonly currency: Currency;
  readonly amountMinor: number;
  readonly taxIncluded: boolean;
  readonly status: SubscriptionStatus;
  readonly currentPeriodStart: Date;
  readonly currentPeriodEnd: Date;
  readonly cancelAtPeriodEnd: boolean;
  /**
   * Which tier takes over at `currentPeriodEnd`, or `null` to renew on this one.
   *
   * A downgrade is scheduled rather than immediate (owner decision): the paid tier serves out the
   * period that was paid for. Cancellation is the case where this is `free`, which is why
   * `cancelAtPeriodEnd` is derived from it by the one service that writes both.
   */
  readonly scheduledPlanCode: PlanCode | null;
  readonly canceledAt: Date | null;
  readonly provider: {
    readonly name: BillingProviderName;
    readonly customerId: string | null;
    readonly subscriptionId: string | null;
  };
}

const subscriptionSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    plan: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },

    // Copied at purchase, never read back through the `plan` reference: editing the catalogue must
    // not retroactively change what somebody already bought.
    planCode: { type: String, enum: PLAN_CODES, required: true },
    currency: { type: String, enum: CURRENCIES, required: true },
    amountMinor: { type: Number, required: true, min: 0 },
    taxIncluded: { type: Boolean, required: true },

    status: { type: String, enum: SUBSCRIPTION_STATUSES, default: 'active', required: true },
    currentPeriodStart: { type: Date, required: true },
    currentPeriodEnd: { type: Date, required: true },
    cancelAtPeriodEnd: { type: Boolean, default: false, required: true },
    scheduledPlanCode: { type: String, enum: PLAN_CODES, default: null },
    canceledAt: { type: Date, default: null },

    provider: {
      name: { type: String, enum: BILLING_PROVIDERS, default: 'none', required: true },
      customerId: { type: String, default: null },
      subscriptionId: { type: String, default: null },
    },
  },
  { timestamps: true },
);

/**
 * Exactly ONE active subscription per user, enforced by the database rather than by the
 * application. A partial unique index constrains only the `active` documents, so a person may hold
 * any number of historical rows and never two live ones — and two checkouts arriving at the same
 * moment cannot both succeed, which an application-level check could not prevent.
 */
subscriptionSchema.index(
  { user: 1 },
  { unique: true, partialFilterExpression: { status: 'active' } },
);

// Billing history, already ordered newest-first.
subscriptionSchema.index({ user: 1, createdAt: -1 });

// The renew-or-expire sweep finds exactly the lapsed periods instead of scanning every sale.
subscriptionSchema.index({ status: 1, currentPeriodEnd: 1 });

export const SubscriptionModel = model('Subscription', subscriptionSchema);
