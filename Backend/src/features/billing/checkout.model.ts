import { Schema, model, type Types } from 'mongoose';

import { CURRENCIES, PLAN_CODES, type Currency, type PlanCode } from './plan.model.js';
import { BILLING_PROVIDERS, type BillingProviderName } from './subscription.model.js';

/**
 * A checkout that has been opened but not yet paid for. `completed` is terminal and is what an
 * activation is guarded on; `failed` and `abandoned` never become a subscription.
 */
export const CHECKOUT_STATUSES = ['pending', 'completed', 'failed'] as const;
export type CheckoutStatus = (typeof CHECKOUT_STATUSES)[number];

/**
 * One in-flight attempt to buy a period.
 *
 * It is a separate collection rather than an extra status on `subscriptions` so that the
 * one-active-subscription index keeps meaning exactly what it says, and so an abandoned checkout
 * leaves no subscription row at all. It is also where duplicate-event safety lives: the provider's
 * own reference is unique here, and the pending → completed transition is the atomic gate a repeat
 * webhook loses.
 */
export interface CheckoutRecord {
  readonly _id: Types.ObjectId;
  readonly user: Types.ObjectId;
  readonly plan: Types.ObjectId;
  readonly planCode: PlanCode;
  readonly currency: Currency;
  readonly amountMinor: number;
  readonly taxIncluded: boolean;
  readonly provider: BillingProviderName;
  /** The provider's reference for this attempt. What an incoming callback is matched on. */
  readonly providerReference: string;
  readonly status: CheckoutStatus;
  readonly transactionId: string | null;
  readonly createdAt: Date;
}

const checkoutSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    plan: { type: Schema.Types.ObjectId, ref: 'Plan', required: true },

    // Snapshotted here for the same reason they are on a subscription: what was quoted at the
    // moment the person was sent to pay is what may be activated when they come back.
    planCode: { type: String, enum: PLAN_CODES, required: true },
    currency: { type: String, enum: CURRENCIES, required: true },
    amountMinor: { type: Number, required: true, min: 0 },
    taxIncluded: { type: Boolean, required: true },

    provider: { type: String, enum: BILLING_PROVIDERS, required: true },
    providerReference: { type: String, required: true, trim: true },
    status: { type: String, enum: CHECKOUT_STATUSES, default: 'pending', required: true },
    transactionId: { type: String, default: null },
  },
  { timestamps: true },
);

/**
 * The idempotency key. A provider that delivers the same callback twice — which every provider
 * does — finds the row already spent rather than creating a second period.
 */
checkoutSchema.index({ provider: 1, providerReference: 1 }, { unique: true });

// The person's own in-flight attempts, newest first.
checkoutSchema.index({ user: 1, createdAt: -1 });

export const CheckoutModel = model('BillingCheckout', checkoutSchema);
