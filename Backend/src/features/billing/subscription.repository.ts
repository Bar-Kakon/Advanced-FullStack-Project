import { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import type { Currency, PlanCode } from './plan.model.js';
import {
  SubscriptionModel,
  type BillingProviderName,
  type SubscriptionRecord,
  type SubscriptionStatus,
} from './subscription.model.js';

export interface NewSubscription {
  readonly user: Types.ObjectId;
  readonly plan: Types.ObjectId;
  readonly planCode: PlanCode;
  readonly currency: Currency;
  readonly amountMinor: number;
  readonly taxIncluded: boolean;
  readonly currentPeriodStart: Date;
  readonly currentPeriodEnd: Date;
  readonly provider: {
    readonly name: BillingProviderName;
    readonly customerId: string | null;
    readonly subscriptionId: string | null;
  };
}

/** What a scheduled change writes. Both fields move together and have one writer between them. */
export interface ScheduledChange {
  readonly scheduledPlanCode: PlanCode | null;
  readonly cancelAtPeriodEnd: boolean;
  readonly canceledAt: Date | null;
}

export interface SubscriptionRepository {
  findActiveByUser(userId: string): Promise<SubscriptionRecord | null>;
  /** The live period one provider subscription is paying for. What every callback is matched on. */
  findActiveByProviderReference(
    provider: BillingProviderName,
    providerSubscriptionId: string,
  ): Promise<SubscriptionRecord | null>;
  /** The billing history the subscriptions screen lists, newest first. */
  findHistoryByUser(userId: string, limit: number): Promise<readonly SubscriptionRecord[]>;
  create(subscription: NewSubscription, session?: DbSession): Promise<SubscriptionRecord>;
  /** Retires whichever period is live, so the partial unique index has room for the next one. */
  expireActive(userId: Types.ObjectId, session?: DbSession): Promise<void>;
  /** Closes one named period, which is what the lapse sweep acts on. */
  closeById(
    id: Types.ObjectId,
    status: Extract<SubscriptionStatus, 'expired' | 'past_due'>,
    session?: DbSession,
  ): Promise<void>;
  scheduleChange(id: Types.ObjectId, change: ScheduledChange): Promise<boolean>;
  /** Moves the period end out by one cycle, which is what a settled recurring charge buys. */
  extendPeriod(id: Types.ObjectId, currentPeriodEnd: Date): Promise<boolean>;
  findLapsed(now: Date, limit: number): Promise<readonly SubscriptionRecord[]>;
}

export const subscriptionRepository: SubscriptionRepository = {
  async findActiveByUser(userId) {
    if (!Types.ObjectId.isValid(userId)) return null;

    return SubscriptionModel.findOne({ user: new Types.ObjectId(userId), status: 'active' })
      .lean<SubscriptionRecord>()
      .exec();
  },

  async findActiveByProviderReference(provider, providerSubscriptionId) {
    if (providerSubscriptionId.length === 0) return null;

    return SubscriptionModel.findOne({
      status: 'active',
      'provider.name': provider,
      'provider.subscriptionId': providerSubscriptionId,
    })
      .lean<SubscriptionRecord>()
      .exec();
  },

  async findHistoryByUser(userId, limit) {
    if (!Types.ObjectId.isValid(userId)) return [];

    return SubscriptionModel.find({ user: new Types.ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean<SubscriptionRecord[]>()
      .exec();
  },

  async create(subscription, session) {
    const [created] = await SubscriptionModel.create(
      [{ ...subscription, status: 'active', cancelAtPeriodEnd: false, scheduledPlanCode: null }],
      session ? { session } : {},
    );
    if (created === undefined) throw new Error('Subscription insert returned no document.');

    const query = SubscriptionModel.findById(created._id);
    if (session) query.session(session);

    return query.lean<SubscriptionRecord>().orFail().exec();
  },

  async expireActive(userId, session) {
    const query = SubscriptionModel.updateOne(
      { user: userId, status: 'active' },
      { $set: { status: 'expired' } },
    );
    if (session) query.session(session);
    await query.exec();
  },

  /**
   * Guarded on `status: 'active'` so the sweep is idempotent: a period another run has already
   * closed matches nothing and is not closed a second time.
   */
  async closeById(id, status, session) {
    const query = SubscriptionModel.updateOne({ _id: id, status: 'active' }, { $set: { status } });
    if (session) query.session(session);
    await query.exec();
  },

  /**
   * Guarded on `status: 'active'`: a period that expired between the read and this write is not
   * quietly given a schedule it will never act on.
   */
  async scheduleChange(id, change) {
    const result = await SubscriptionModel.updateOne(
      { _id: id, status: 'active' },
      { $set: { ...change } },
    ).exec();

    return result.matchedCount === 1;
  },

  /**
   * Guarded on `status: 'active'` for the same reason the sweep is: a period closed between the
   * read and this write is not quietly given a future it will never serve.
   */
  async extendPeriod(id, currentPeriodEnd) {
    const result = await SubscriptionModel.updateOne(
      { _id: id, status: 'active' },
      { $set: { currentPeriodEnd } },
    ).exec();

    return result.matchedCount === 1;
  },

  async findLapsed(now, limit) {
    return SubscriptionModel.find({ status: 'active', currentPeriodEnd: { $lte: now } })
      .sort({ currentPeriodEnd: 1 })
      .limit(limit)
      .lean<SubscriptionRecord[]>()
      .exec();
  },
};
