import { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import {
  alreadyOnPlan,
  billingProviderNotConfigured,
  checkoutFailed,
  noActiveSubscription,
  planNotFound,
  planNotPurchasable,
} from './billing.errors.js';
import type { CheckoutRepository } from './checkout.repository.js';
import type { Currency, PlanCode, PlanRecord, ProviderPlanBinding } from './plan.model.js';
import type { PlanRepository } from './plan.repository.js';
import { DEFAULT_PLAN_CODE } from './planCatalogue.js';
import type { BillingProvider, ProviderEvent } from './provider/billingProvider.port.js';
import type { SubscriptionRecord } from './subscription.model.js';
import type { SubscriptionRepository } from './subscription.repository.js';

/** The person a checkout is opened for. Read from the session, never from the request body. */
export interface BillingCustomer {
  readonly userId: string;
  readonly email: string;
  readonly fullName: string;
}

export interface CurrentPlanView {
  readonly planCode: PlanCode;
  readonly plan: PlanRecord | null;
  readonly subscription: SubscriptionRecord | null;
  /** Whether a checkout can be opened at all on this deployment. */
  readonly checkoutAvailable: boolean;
}

export interface CheckoutStarted {
  readonly redirectUrl: string;
}

export interface TransactionRunner {
  run<T>(work: (session: DbSession) => Promise<T>): Promise<T>;
}

export interface PlanCodeWriter {
  findPlanCode(userId: string): Promise<PlanCode | null>;
  setPlanCode(userId: Types.ObjectId, planCode: PlanCode, session?: DbSession): Promise<void>;
}

export interface SubscriptionService {
  catalogue(): Promise<readonly PlanRecord[]>;
  currentPlan(userId: string): Promise<CurrentPlanView>;
  history(userId: string): Promise<readonly SubscriptionRecord[]>;
  startCheckout(customer: BillingCustomer, planCode: PlanCode): Promise<CheckoutStarted>;
  /** Downgrade or cancel. Both take effect at the end of the period already paid for. */
  scheduleChange(userId: string, planCode: PlanCode): Promise<void>;
  /** Withdraws a scheduled change, so the current tier simply continues. */
  keepCurrentPlan(userId: string): Promise<void>;
  /** A verified provider callback. Answers whether anything changed, for the route's status. */
  applyProviderEvent(
    rawBody: Buffer,
    headers: Readonly<Record<string, string | undefined>>,
  ): Promise<boolean>;
  /** Applies every period that has run out. Idempotent, so it may be run as often as wanted. */
  reconcileLapsed(now: Date, limit: number): Promise<number>;
}

export interface SubscriptionDependencies {
  readonly plans: PlanRepository;
  readonly subscriptions: SubscriptionRepository;
  readonly checkouts: CheckoutRepository;
  readonly users: PlanCodeWriter;
  readonly provider: BillingProvider;
  readonly transactions: TransactionRunner;
  /** Where the browser is sent back to, and where the provider posts. Both from config. */
  readonly frontendUrl: string;
  readonly apiUrl: string;
}

const HISTORY_LIMIT = 24;
const SWEEP_LIMIT = 500;

const CANCEL_REASON = 'Cancelled by the account holder';

/**
 * One billing month. Adding a month to the 31st of a short month would roll into the next one, so
 * the day is clamped — a period that starts on the 31st ends on the 30th, never on the 1st.
 */
export const addMonth = (from: Date): Date => {
  const end = new Date(from);
  const day = end.getUTCDate();
  end.setUTCMonth(end.getUTCMonth() + 1);
  if (end.getUTCDate() !== day) end.setUTCDate(0);
  return end;
};

/**
 * Which currency a sale is quoted in.
 *
 * D11 left open whether the account country becomes a field on `users` or is derived at checkout,
 * and nothing has closed it. Until it does, the shekel price is used: it is the only one of the
 * two the product is certain about, the site is Hebrew by default, and picking by interface
 * language — which the static prototype does — would let switching to English change the price.
 */
const CURRENCY: Currency = 'ILS';

const priceOf = (plan: PlanRecord): { amountMinor: number; taxIncluded: boolean } => {
  const row = plan.prices.find((price) => price.currency === CURRENCY);
  if (row === undefined) throw new Error(`Plan ${plan.code} has no ${CURRENCY} price.`);
  return { amountMinor: row.amountMinor, taxIncluded: row.taxIncluded };
};

export const createSubscriptionService = ({
  plans,
  subscriptions,
  checkouts,
  users,
  provider,
  transactions,
  frontendUrl,
  apiUrl,
}: SubscriptionDependencies): SubscriptionService => {
  const requirePlan = async (code: PlanCode): Promise<PlanRecord> => {
    const plan = await plans.findByCode(code);
    if (plan === null || !plan.active) throw planNotFound();
    return plan;
  };

  /** What the configured provider calls this tier, or `null` when it has never been registered. */
  const bindingOf = (plan: PlanRecord): ProviderPlanBinding | null =>
    provider.name === 'paypal' ? (plan.providerPlans?.paypal ?? null) : null;

  const requireBinding = (plan: PlanRecord): ProviderPlanBinding => {
    const binding = bindingOf(plan);
    if (binding === null) throw billingProviderNotConfigured();
    return binding;
  };

  /** The provider handle for a period, or `null` when that period was never sold through one. */
  const referenceOf = (subscription: SubscriptionRecord): string | null =>
    subscription.provider.name === provider.name ? subscription.provider.subscriptionId : null;

  /**
   * The one write that changes what somebody is entitled to.
   *
   * The old period is retired and the new one inserted inside a single transaction, because the
   * partial unique index permits exactly one `active` row and the two writes are only correct
   * together. `users.planCode` is written in the same transaction, so the cache and its source can
   * never disagree.
   */
  const activate = async (
    userId: Types.ObjectId,
    plan: PlanRecord,
    providerIds: { customerId: string | null; subscriptionId: string | null },
  ): Promise<void> => {
    const { amountMinor, taxIncluded } = priceOf(plan);
    const start = new Date();

    await transactions.run(async (session) => {
      await subscriptions.expireActive(userId, session);
      await subscriptions.create(
        {
          user: userId,
          plan: plan._id,
          planCode: plan.code,
          currency: CURRENCY,
          amountMinor,
          taxIncluded,
          currentPeriodStart: start,
          currentPeriodEnd: addMonth(start),
          provider: { name: provider.name, ...providerIds },
        },
        session,
      );
      await users.setPlanCode(userId, plan.code, session);
    });
  };

  /**
   * A period that has run out. A scheduled change is applied; an unscheduled lapse becomes
   * `past_due` and drops to Free, because a tier nobody has paid for must not keep being served.
   *
   * A tier the provider is still billing renews on its own event instead of reaching here, so an
   * unscheduled lapse means the provider stopped paying for it.
   */
  const applyLapse = async (subscription: SubscriptionRecord): Promise<void> => {
    const target = subscription.scheduledPlanCode ?? DEFAULT_PLAN_CODE;
    const status = subscription.scheduledPlanCode === null ? 'past_due' : 'expired';

    await transactions.run(async (session) => {
      await subscriptions.closeById(subscription._id, status, session);

      if (target !== DEFAULT_PLAN_CODE) {
        const plan = await plans.findByCode(target);
        if (plan !== null) {
          const { amountMinor, taxIncluded } = priceOf(plan);
          const start = subscription.currentPeriodEnd;
          await subscriptions.create(
            {
              user: subscription.user,
              plan: plan._id,
              planCode: plan.code,
              currency: CURRENCY,
              amountMinor,
              taxIncluded,
              currentPeriodStart: start,
              currentPeriodEnd: addMonth(start),
              // The provider keeps billing the same subscription; only the tier it pays for moved.
              provider: {
                name: subscription.provider.name,
                customerId: subscription.provider.customerId,
                subscriptionId: subscription.provider.subscriptionId,
              },
            },
            session,
          );
        }
      }

      await users.setPlanCode(subscription.user, target, session);
    });
  };

  /** A settled recurring charge: the period the provider just paid for is extended by a month. */
  const applyRenewal = async (event: ProviderEvent): Promise<boolean> => {
    const active = await subscriptions.findActiveByProviderReference(
      provider.name,
      event.providerReference,
    );
    if (active === null) return false;

    // The sale id is the idempotency key, so a redelivered payment extends the period exactly once.
    const recorded = await checkouts.createSettled({
      user: active.user,
      plan: active.plan,
      planCode: active.planCode,
      // The period that was renewed, at the price it was sold for. The catalogue is not re-read:
      // a renewal charges what the subscription says, exactly as the original sale did.
      currency: active.currency,
      amountMinor: active.amountMinor,
      taxIncluded: active.taxIncluded,
      provider: provider.name,
      providerReference: `sale:${event.transactionId ?? event.providerReference}`,
      transactionId: event.transactionId,
    });
    if (recorded === null) return false;

    return subscriptions.extendPeriod(active._id, addMonth(active.currentPeriodEnd));
  };

  /** A revise the payer approved: the same provider subscription now pays for another tier. */
  const applyRevision = async (event: ProviderEvent): Promise<boolean> => {
    if (event.providerPlanId === null) return false;

    const active = await subscriptions.findActiveByProviderReference(
      provider.name,
      event.providerReference,
    );
    if (active === null) return false;

    const plan = await plans.findByPayPalPlanId(event.providerPlanId);
    if (plan === null || plan.code === active.planCode) return false;

    await activate(active.user, plan, {
      customerId: active.provider.customerId,
      subscriptionId: event.providerReference,
    });

    return true;
  };

  /**
   * The provider stopped billing. Access is not withdrawn here: the period already paid for runs
   * to `currentPeriodEnd`, and the sweep ends it — which is the approved cancellation rule.
   */
  const applyCancellation = async (event: ProviderEvent): Promise<boolean> => {
    const active = await subscriptions.findActiveByProviderReference(
      provider.name,
      event.providerReference,
    );
    if (active === null || active.cancelAtPeriodEnd) return false;

    return subscriptions.scheduleChange(active._id, {
      scheduledPlanCode: DEFAULT_PLAN_CODE,
      cancelAtPeriodEnd: true,
      canceledAt: new Date(),
    });
  };

  /** A first activation, which is the only path that turns a pending checkout into a period. */
  const applyActivation = async (event: ProviderEvent): Promise<boolean> => {
    const pending = await checkouts.findByReference(provider.name, event.providerReference);
    if (pending === null || pending.status !== 'pending') return false;

    if (!(await provider.confirmActive(event.providerReference))) {
      await checkouts.markFailed(provider.name, event.providerReference);
      return false;
    }

    const claimed = await checkouts.claimPending(
      provider.name,
      event.providerReference,
      event.transactionId,
    );
    if (claimed === null) return false;

    const plan = await plans.findByCode(claimed.planCode);
    if (plan === null) throw planNotFound();

    await activate(claimed.user, plan, {
      customerId: null,
      subscriptionId: event.providerReference,
    });

    return true;
  };

  return {
    catalogue: () => plans.findActive(),

    /**
     * Free is answered as a plan, not as an absence. Somebody who has never paid has no
     * subscription document at all, and this returns the Free tier with a null subscription rather
     * than an error — which is what makes Free work with no provider record anywhere.
     */
    async currentPlan(userId) {
      const planCode = (await users.findPlanCode(userId)) ?? DEFAULT_PLAN_CODE;

      return {
        planCode,
        plan: await plans.findByCode(planCode),
        subscription: await subscriptions.findActiveByUser(userId),
        checkoutAvailable: provider.canCheckout,
      };
    },

    history: (userId) => subscriptions.findHistoryByUser(userId, HISTORY_LIMIT),

    /**
     * Opens a checkout. Nothing about the person's entitlement moves here: the row written is a
     * pending attempt, and only a confirmed provider event turns one into a subscription.
     *
     * The price is read from the catalogue on the server. A client that posts an amount has it
     * ignored — the request body carries a plan code and nothing else.
     */
    async startCheckout({ userId, email, fullName }, planCode) {
      if (planCode === DEFAULT_PLAN_CODE) throw planNotPurchasable();

      const plan = await requirePlan(planCode);
      const current = (await users.findPlanCode(userId)) ?? DEFAULT_PLAN_CODE;
      if (current === planCode) throw alreadyOnPlan();

      const active = await subscriptions.findActiveByUser(userId);
      const existing = active === null ? null : referenceOf(active);

      // Moving between paid tiers revises the subscription the provider already bills, rather than
      // opening a second one it would bill alongside the first.
      if (existing !== null) {
        const binding = requireBinding(plan);

        let revised;
        try {
          revised = await provider.reviseSubscription(existing, binding.planId);
        } catch {
          throw checkoutFailed();
        }

        // Nothing is granted here either: the entitlement moves on the approval event.
        return {
          redirectUrl: revised.approvalUrl ?? `${frontendUrl}/subscriptions?checkout=pending`,
        };
      }

      const { amountMinor, taxIncluded } = priceOf(plan);

      let session;
      try {
        session = await provider.createCheckout({
          planCode: plan.code,
          currency: CURRENCY,
          amountMinor,
          providerPlanId: bindingOf(plan)?.planId ?? null,
          customerName: fullName,
          customerEmail: email,
          successUrl: `${frontendUrl}/subscriptions?checkout=success`,
          failureUrl: `${frontendUrl}/subscriptions?checkout=failed`,
          callbackUrl: `${apiUrl}/billing/provider-events`,
        });
      } catch (error) {
        if (!provider.canCheckout) throw error;
        throw checkoutFailed();
      }

      await checkouts.create({
        user: new Types.ObjectId(userId),
        plan: plan._id,
        planCode: plan.code,
        currency: CURRENCY,
        amountMinor,
        taxIncluded,
        provider: provider.name,
        providerReference: session.providerReference,
      });

      return { redirectUrl: session.redirectUrl };
    },

    /**
     * A downgrade and a cancellation are the same operation with different targets, and both land
     * at the end of the period already paid for (owner decision). Nothing is charged, nothing is
     * refunded, and access does not change today.
     *
     * The provider is told first. Cancelling locally and failing to cancel there would keep
     * charging somebody who has already been told they are cancelled, which is the one failure
     * direction that must not happen.
     */
    async scheduleChange(userId, planCode) {
      const active = await subscriptions.findActiveByUser(userId);
      if (active === null) throw noActiveSubscription();
      if (active.planCode === planCode) throw alreadyOnPlan();

      const target = planCode === DEFAULT_PLAN_CODE ? null : await requirePlan(planCode);
      const reference = referenceOf(active);

      if (reference !== null) {
        if (target === null) {
          await provider.cancelSubscription(reference, CANCEL_REASON);
        } else {
          const revised = await provider.reviseSubscription(reference, requireBinding(target).planId);
          // A revise the provider will not apply until the payer approves it cannot be scheduled
          // silently: the next charge would still be at the old tier's price.
          if (revised.approvalUrl !== null) throw checkoutFailed();
        }
      }

      const scheduled = await subscriptions.scheduleChange(active._id, {
        scheduledPlanCode: planCode,
        // Cancellation is the case where the scheduled tier is Free. One writer sets both, so the
        // boolean the screen reads can never disagree with the target the sweep acts on.
        cancelAtPeriodEnd: planCode === DEFAULT_PLAN_CODE,
        canceledAt: new Date(),
      });
      if (!scheduled) throw noActiveSubscription();
    },

    async keepCurrentPlan(userId) {
      const active = await subscriptions.findActiveByUser(userId);
      if (active === null) throw noActiveSubscription();

      const cleared = await subscriptions.scheduleChange(active._id, {
        scheduledPlanCode: null,
        cancelAtPeriodEnd: false,
        canceledAt: null,
      });
      if (!cleared) throw noActiveSubscription();
    },

    /**
     * The only path that grants a paid tier.
     *
     * The callback must carry the provider's own proof that it sent these bytes, and the tier
     * always comes from the stored attempt or the catalogue — never from the payload. A caller who
     * could forge a body still could not name the tier it buys.
     */
    async applyProviderEvent(rawBody, headers) {
      const event = await provider.verifyEvent(rawBody, headers);
      if (event === null) return false;

      switch (event.kind) {
        case 'activated':
          return applyActivation(event);
        case 'updated':
          return applyRevision(event);
        case 'renewed':
          return applyRenewal(event);
        case 'canceled':
          return applyCancellation(event);
        case 'failed':
          await checkouts.markFailed(provider.name, event.providerReference);
          return false;
      }
    },

    async reconcileLapsed(now, limit) {
      const lapsed = await subscriptions.findLapsed(now, Math.min(limit, SWEEP_LIMIT));
      for (const subscription of lapsed) await applyLapse(subscription);

      return lapsed.length;
    },
  };
};
