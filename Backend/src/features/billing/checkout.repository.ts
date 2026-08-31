import { Types } from 'mongoose';

import { CheckoutModel, type CheckoutRecord } from './checkout.model.js';
import type { Currency, PlanCode } from './plan.model.js';
import type { BillingProviderName } from './subscription.model.js';

export interface NewCheckout {
  readonly user: Types.ObjectId;
  readonly plan: Types.ObjectId;
  readonly planCode: PlanCode;
  readonly currency: Currency;
  readonly amountMinor: number;
  readonly taxIncluded: boolean;
  readonly provider: BillingProviderName;
  readonly providerReference: string;
}

export interface CheckoutRepository {
  create(checkout: NewCheckout): Promise<CheckoutRecord>;
  findByReference(
    provider: BillingProviderName,
    providerReference: string,
  ): Promise<CheckoutRecord | null>;
  /**
   * The idempotency gate. Answers the row only on the transition that actually happened, so a
   * repeated callback — which every provider sends — gets `null` and activates nothing.
   */
  claimPending(
    provider: BillingProviderName,
    providerReference: string,
    transactionId: string | null,
  ): Promise<CheckoutRecord | null>;
  markFailed(provider: BillingProviderName, providerReference: string): Promise<void>;
}

export const checkoutRepository: CheckoutRepository = {
  async create(checkout) {
    const [created] = await CheckoutModel.create([{ ...checkout, status: 'pending' }]);
    if (created === undefined) throw new Error('Checkout insert returned no document.');

    return CheckoutModel.findById(created._id).lean<CheckoutRecord>().orFail().exec();
  },

  async findByReference(provider, providerReference) {
    return CheckoutModel.findOne({ provider, providerReference }).lean<CheckoutRecord>().exec();
  },

  /**
   * `status: 'pending'` is inside the filter rather than checked beforehand. A read-then-write
   * check loses the race between two copies of the same event arriving together, and the whole
   * point of this row is that exactly one of them may proceed.
   */
  async claimPending(provider, providerReference, transactionId) {
    return CheckoutModel.findOneAndUpdate(
      { provider, providerReference, status: 'pending' },
      { $set: { status: 'completed', transactionId } },
      { new: true },
    )
      .lean<CheckoutRecord>()
      .exec();
  },

  async markFailed(provider, providerReference) {
    await CheckoutModel.updateOne(
      { provider, providerReference, status: 'pending' },
      { $set: { status: 'failed' } },
    ).exec();
  },
};
