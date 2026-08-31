/**
 * Subscriptions: the Free state, the entitlement boundary, the lifecycle, and what a client cannot
 * do to its own plan.
 *
 * The same split as the Google script, for the same reason. PayPal's own HTTP calls cannot run here
 * — no credentials exist, and inventing them would prove nothing — so the callback checks are
 * exercised against the REAL adapter with a stubbed HTTP client, while the lifecycle runs against
 * the real services with a stubbed provider. Everything the repository, the indexes and the
 * entitlement boundary do is real throughout.
 *
 *   npm run verify:subscriptions
 */
import { loadConfig } from '../src/config/env.js';
import { runInTransaction } from '../src/db/mongoose.js';
import { CheckoutModel } from '../src/features/billing/checkout.model.js';
import { checkoutRepository } from '../src/features/billing/checkout.repository.js';
import { createEntitlementService } from '../src/features/billing/entitlements.service.js';
import { PlanModel } from '../src/features/billing/plan.model.js';
import { planRepository } from '../src/features/billing/plan.repository.js';
import { PLAN_CATALOGUE } from '../src/features/billing/planCatalogue.js';
import { createPayPalProvider } from '../src/features/billing/provider/payPal.adapter.js';
import { createUnconfiguredProvider } from '../src/features/billing/provider/none.adapter.js';
import type { BillingProvider } from '../src/features/billing/provider/billingProvider.port.js';
import type { PayPalClient } from '../src/features/billing/provider/payPalClient.js';
import { SubscriptionModel } from '../src/features/billing/subscription.model.js';
import { subscriptionRepository } from '../src/features/billing/subscription.repository.js';
import { createSubscriptionService } from '../src/features/billing/subscription.service.js';
import { userRepository } from '../src/features/users/user.repository.js';
import { UserModel } from '../src/features/users/user.model.js';
import { AppError } from '../src/shared/errors.js';
import { createAccount, cleanUp } from './support/accounts.js';
import { check, finish, request, section, startHarness } from './support/harness.js';

const MARKER = 'subs-verify';

/** Records what the lifecycle actually sent to the provider, which is half of what is asserted. */
interface ProviderCalls {
  canceled: { reference: string; reason: string }[];
  revised: { reference: string; planId: string }[];
}

const codeOf = (error: unknown): string =>
  error instanceof AppError ? error.code : `unexpected:${String(error)}`;

const rejects = async (work: Promise<unknown>): Promise<string> => {
  try {
    await work;
    return 'resolved';
  } catch (error) {
    return codeOf(error);
  }
};

/** Stands in for the payment provider, and for nothing else below it. */
const stubProvider = (
  reference: string,
  paid: boolean,
  calls: ProviderCalls = { canceled: [], revised: [] },
): BillingProvider => ({
  name: 'paypal',
  canCheckout: true,
  async createCheckout() {
    return { providerReference: reference, redirectUrl: `https://pay.example/${reference}` };
  },
  async verifyEvent() {
    return {
      kind: 'activated',
      providerReference: reference,
      transactionId: 'txn-1',
      providerPlanId: null,
    };
  },
  async confirmActive() {
    return paid;
  },
  async cancelSubscription(providerReference, reason) {
    calls.canceled.push({ reference: providerReference, reason });
  },
  async reviseSubscription(providerReference, providerPlanId) {
    calls.revised.push({ reference: providerReference, planId: providerPlanId });
    return { approvalUrl: null };
  },
});

/** A PayPal HTTP client that answers what the test needs, so the REAL adapter can be exercised. */
const stubPayPalClient = (verification: string, overrides: Record<string, unknown> = {}): PayPalClient => ({
  settings: {
    clientId: 'id', clientSecret: 'secret', webhookId: 'WH-TEST',
    baseUrl: 'https://api-m.sandbox.paypal.com', timeoutMs: 5000,
  },
  async request<T>(_method: string, path: string): Promise<T> {
    if (path === '/v1/notifications/verify-webhook-signature') {
      return { verification_status: verification } as T;
    }
    return overrides as T;
  },
});

const PAYPAL_HEADERS = {
  'paypal-cert-url': 'https://api.sandbox.paypal.com/v1/notifications/certs/CERT-abc',
  'paypal-transmission-id': 'tx-1',
  'paypal-transmission-sig': 'sig-1',
  'paypal-transmission-time': '2026-08-31T00:00:00Z',
  'paypal-auth-algo': 'SHA256withRSA',
};

const run = async (): Promise<never> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  const config = loadConfig();

  await cleanUp(MARKER);
  await CheckoutModel.deleteMany({ providerReference: new RegExp(`^${MARKER}`) }).exec();

  section('The catalogue is seeded, and it is the reconciled one');

  await planRepository.seedMissing();
  const plans = await planRepository.findActive();
  check(plans.length === 3, 'three tiers exist', plans.map((p) => p.code).join(', '));
  check(
    plans.map((p) => p.code).join(',') === 'free,basic,premium',
    'named exactly Free, Basic and Premium, in order',
  );
  check(plans.every((p) => p.provisional), 'every tier is still marked provisional');

  const limitKeys = Object.keys(plans[0]?.limits ?? {});
  check(
    !limitKeys.some((key) => /simulation|render|visual/i.test(key)),
    'no visualization limit survives anywhere in the catalogue',
    limitKeys.filter((key) => /simulation|render|visual/i.test(key)).join(', '),
  );
  check(
    !limitKeys.includes('fileVersions'),
    'version depth is no longer a plan differentiator',
  );

  const free = plans.find((p) => p.code === 'free');
  const basic = plans.find((p) => p.code === 'basic');
  const premium = plans.find((p) => p.code === 'premium');
  check(
    free?.limits.activeProjects === 5 && basic?.limits.activeProjects === 25
      && premium?.limits.activeProjects === 100,
    'the approved project ladder is 5 / 25 / 100',
  );
  check(
    free?.limits.activeDelegations === 1 && basic?.limits.activeDelegations === 5
      && premium?.limits.activeDelegations === null,
    'active delegations are 1 / 5 / unlimited, per the rebuilt ladder',
  );
  check(
    basic?.prices.find((p) => p.currency === 'ILS')?.amountMinor === 6000
      && premium?.prices.find((p) => p.currency === 'ILS')?.amountMinor === 10500,
    'prices are the approved ₪60 and ₪105, in minor units',
  );

  section('Free is a product state, not the absence of one');

  const account = await createAccount(baseUrl, MARKER, 1);
  const userId = account.userId.toString();

  check(
    (await SubscriptionModel.countDocuments({ user: account.userId }).exec()) === 0,
    'a new account has no subscription document at all',
  );
  check(
    (await CheckoutModel.countDocuments({ user: account.userId }).exec()) === 0,
    'and no provider record anywhere',
  );

  const entitlements = createEntitlementService({ plans: planRepository, users: userRepository });
  const onFree = await entitlements.forUser(userId);
  check(onFree.planCode === 'free', 'and it still resolves to a plan', onFree.planCode);
  check(onFree.limits.activeProjects === 5, 'with the Free limits');
  check(await entitlements.mayUse(userId, 'muteControls') === false, 'a Free capability answers false');
  check(await entitlements.mayUse(userId, 'emailNotifications') === false, 'and so does another');
  check(await entitlements.limitFor(userId, 'connections') === 50, 'a Free numeric limit reads back');

  const mine = await request(baseUrl, 'GET', '/api/billing/me', { token: account.token });
  check(mine.status === 200, 'the current-plan endpoint answers for a Free account', mine.status);
  check(mine.body['planCode'] === 'free', 'saying free rather than erroring');
  check(mine.body['subscription'] === null, 'with no subscription');

  const catalogueResponse = await request(baseUrl, 'GET', '/api/billing/plans');
  check(catalogueResponse.status === 200, 'the catalogue is readable');
  const wire = JSON.stringify(catalogueResponse.body);
  check(!/secret|api-key|apiKey|customerId/i.test(wire), 'and carries no secret or provider id');

  section('A client cannot give itself a paid plan');

  const forgedPlan = await request(baseUrl, 'GET', '/api/billing/me', { token: account.token });
  check(forgedPlan.body['planCode'] === 'free', 'the plan is read, never sent by the client');

  // There is no endpoint that sets a plan, and the checkout route takes a code and nothing else.
  const putPlan = await request(baseUrl, 'POST', '/api/billing/me', {
    token: account.token,
    json: { planCode: 'premium' },
  });
  check(putPlan.status === 404, 'no endpoint exists to assign a plan directly', putPlan.status);

  const pricedCheckout = await request(baseUrl, 'POST', '/api/billing/me/checkout', {
    token: account.token,
    json: { planCode: 'premium', amountMinor: 1, currency: 'ILS' },
  });
  // Whatever the provider answers, the two money fields were stripped by validation before the
  // handler saw them: they are not in the schema, and unknown keys do not survive it.
  check(
    pricedCheckout.status !== 200 || (await SubscriptionModel.countDocuments({ user: account.userId }).exec()) === 0,
    'a checkout carrying its own price still activates nothing',
  );
  check(
    (await UserModel.findById(account.userId).select('planCode').lean().exec())?.planCode === 'free',
    'and the account is still on Free',
  );

  const unauth = await request(baseUrl, 'GET', '/api/billing/me');
  check(unauth.status === 401, 'billing state needs a session', unauth.status);

  const otherAccount = await createAccount(baseUrl, MARKER, 2);
  const cross = await request(baseUrl, 'GET', '/api/billing/me', { token: otherAccount.token });
  check(
    cross.body['planCode'] === 'free' && mine.body['planCode'] === 'free',
    'and every read is scoped to the caller — no route takes another user id',
  );

  section('The unconfigured provider refuses rather than pretends');

  const none = createUnconfiguredProvider();
  check(none.canCheckout === false, 'it reports that checkout is unavailable');
  check(await rejects(none.createCheckout({} as never)) === 'BILLING_PROVIDER_NOT_CONFIGURED',
    'and refuses to open one');
  check(
    (await none.verifyEvent(Buffer.from('{}'), {})) === null,
    'no callback can be authentic without a provider',
  );

  section('The PayPal callback check, against the real adapter');

  const settings = {
    clientId: 'id', clientSecret: 'secret', webhookId: 'WH-TEST',
    baseUrl: 'https://api-m.sandbox.paypal.com', timeoutMs: 5000,
  };
  const activated = Buffer.from(JSON.stringify({
    event_type: 'BILLING.SUBSCRIPTION.ACTIVATED',
    resource: { id: 'I-REF1', plan_id: 'P-BASIC' },
  }));

  const verifies = createPayPalProvider(settings, stubPayPalClient('SUCCESS'));
  const refuses = createPayPalProvider(settings, stubPayPalClient('FAILURE'));

  check(
    (await verifies.verifyEvent(activated, PAYPAL_HEADERS))?.providerReference === 'I-REF1',
    'a callback PayPal verifies is accepted, and names its subscription',
  );
  check(
    (await refuses.verifyEvent(activated, PAYPAL_HEADERS)) === null,
    'a callback PayPal will not verify is refused',
  );
  check(
    (await verifies.verifyEvent(activated, {})) === null,
    'and so is one carrying no transmission headers at all',
  );
  check(
    (await verifies.verifyEvent(activated, { ...PAYPAL_HEADERS, 'paypal-transmission-sig': undefined })) === null,
    'a missing signature header is refused before anything is fetched',
  );

  // The certificate is fetched by PayPal, not by us, but a forged URL must never be handed on.
  check(
    (await verifies.verifyEvent(activated, {
      ...PAYPAL_HEADERS,
      'paypal-cert-url': 'https://attacker.example/cert.pem',
    })) === null,
    'a certificate URL that is not PayPal is refused',
  );
  check(
    (await verifies.verifyEvent(activated, {
      ...PAYPAL_HEADERS,
      'paypal-cert-url': 'https://paypal.com.attacker.example/cert.pem',
    })) === null,
    'and so is a look-alike host that merely starts with paypal.com',
  );

  check(
    (await verifies.verifyEvent(Buffer.from('not json'), PAYPAL_HEADERS)) === null,
    'an unparseable body is refused',
  );
  check(
    (await verifies.verifyEvent(
      Buffer.from(JSON.stringify({ event_type: 'BILLING.SUBSCRIPTION.RENAMED', resource: { id: 'I-X' } })),
      PAYPAL_HEADERS,
    )) === null,
    'an event type this application does not act on is ignored',
  );

  const renewal = Buffer.from(JSON.stringify({
    event_type: 'PAYMENT.SALE.COMPLETED',
    resource: { id: 'SALE-1', billing_agreement_id: 'I-REF1' },
  }));
  const renewalEvent = await verifies.verifyEvent(renewal, PAYPAL_HEADERS);
  check(
    renewalEvent?.kind === 'renewed' && renewalEvent.providerReference === 'I-REF1',
    'a recurring charge is read as a renewal of its own subscription',
  );
  check(renewalEvent?.transactionId === 'SALE-1', 'and carries the sale id it must be deduplicated on');

  section('Upgrade activates once, and only on a confirmed event');

  const reference = `${MARKER}-ref-${Date.now()}`;
  const service = (paid: boolean) =>
    createSubscriptionService({
      plans: planRepository,
      subscriptions: subscriptionRepository,
      checkouts: checkoutRepository,
      users: userRepository,
      provider: stubProvider(reference, paid),
      transactions: { run: runInTransaction },
      frontendUrl: config.frontendUrl,
      apiUrl: 'https://api.example/api',
    });

  const started = await service(true).startCheckout(
    { userId, email: account.email, fullName: 'Verify Account1' },
    'basic',
  );
  check(started.redirectUrl.length > 0, 'a checkout answers a redirect URL');
  check(
    (await UserModel.findById(account.userId).select('planCode').lean().exec())?.planCode === 'free',
    'and grants nothing yet',
  );

  const unpaidEvent = await service(false).applyProviderEvent(Buffer.from('{}'), {});
  check(unpaidEvent === false, 'an unpaid event activates nothing');
  check(
    (await UserModel.findById(account.userId).select('planCode').lean().exec())?.planCode === 'free',
    'and the account stays on Free',
  );

  // The attempt was marked failed by the unpaid event, so a fresh one is opened for the paid path.
  const secondReference = `${MARKER}-ref2-${Date.now()}`;
  const calls: ProviderCalls = { canceled: [], revised: [] };
  const paidService = createSubscriptionService({
    plans: planRepository,
    subscriptions: subscriptionRepository,
    checkouts: checkoutRepository,
    users: userRepository,
    provider: stubProvider(secondReference, true, calls),
    transactions: { run: runInTransaction },
    frontendUrl: config.frontendUrl,
    apiUrl: 'https://api.example/api',
  });
  await paidService.startCheckout(
    { userId, email: account.email, fullName: 'Verify Account1' },
    'basic',
  );

  // The body claims Premium. The tier must come from the stored attempt, which says Basic.
  const forged = Buffer.from(JSON.stringify({
    planCode: 'premium', plan_id: 'P-PREMIUM', amountMinor: 1, resource: { plan_id: 'P-PREMIUM' },
  }));
  const applied = await paidService.applyProviderEvent(forged, {});
  check(applied, 'a confirmed event activates the plan');
  check(
    (await UserModel.findById(account.userId).select('planCode').lean().exec())?.planCode === 'basic',
    'the cached plan code follows the STORED attempt, not the tier the payload named',
  );
  check(
    (await subscriptionRepository.findActiveByUser(userId))?.amountMinor === 6000,
    'and the price is the catalogue Basic price, not the one the payload carried',
  );

  const upgraded = await entitlements.forUser(userId);
  check(upgraded.planCode === 'basic', 'and the entitlement boundary agrees');
  check(upgraded.limits.activeProjects === 25, 'with the Basic limits');
  check(await entitlements.mayUse(userId, 'muteControls'), 'a Basic capability now answers true');

  section('The same event delivered again changes nothing');

  const replay = await paidService.applyProviderEvent(forged, {});
  check(replay === false, 'a repeated callback is ignored');
  check(
    (await SubscriptionModel.countDocuments({ user: account.userId, status: 'active' }).exec()) === 1,
    'exactly one active subscription remains',
  );
  check(
    (await SubscriptionModel.countDocuments({ user: account.userId }).exec()) === 1,
    'and no second period was written',
  );

  section('One active subscription is a database guarantee');

  const activePlan = await planRepository.findByCode('premium');
  if (activePlan === null) throw new Error('The premium tier is missing from the catalogue.');

  let indexHeld = false;
  try {
    await SubscriptionModel.create({
      user: account.userId,
      plan: activePlan._id,
      planCode: 'premium',
      currency: 'ILS', amountMinor: 10500, taxIncluded: true,
      status: 'active',
      currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 86_400_000),
    });
  } catch {
    indexHeld = true;
  }
  check(indexHeld, 'a second active row is refused by the partial unique index');

  section('Downgrade and cancellation land at the end of the paid period');

  await paidService.scheduleChange(userId, 'free');
  const canceled = await subscriptionRepository.findActiveByUser(userId);

  // Without this the provider keeps charging somebody who has been told they are cancelled.
  check(calls.canceled.length === 1, 'cancelling actually reaches the provider');
  check(
    calls.canceled[0]?.reference === secondReference,
    'and names the subscription PayPal is billing, not the local period id',
  );

  check(canceled?.cancelAtPeriodEnd === true, 'cancelling sets the flag the screen reads');
  check(canceled?.scheduledPlanCode === 'free', 'and schedules the tier the sweep will apply');
  check(canceled?.status === 'active', 'the subscription stays active until the period ends');
  check(
    (await UserModel.findById(account.userId).select('planCode').lean().exec())?.planCode === 'basic',
    'and access does not change today',
  );

  await paidService.keepCurrentPlan(userId);
  const kept = await subscriptionRepository.findActiveByUser(userId);
  check(kept?.scheduledPlanCode === null && kept?.cancelAtPeriodEnd === false,
    'withdrawing the change clears both fields together');

  const sameTier = await rejects(paidService.scheduleChange(userId, 'basic'));
  check(sameTier === 'ALREADY_ON_PLAN', 'scheduling the tier already held is refused', sameTier);
  const buyFree = await rejects(
    paidService.startCheckout({ userId, email: account.email, fullName: 'x' }, 'free'),
  );
  check(buyFree === 'PLAN_NOT_PURCHASABLE', 'Free cannot be bought', buyFree);

  section('The sweep applies a scheduled change once the period has passed');

  await paidService.scheduleChange(userId, 'free');
  await SubscriptionModel.updateOne(
    { user: account.userId, status: 'active' },
    { $set: { currentPeriodEnd: new Date(Date.now() - 1000) } },
  ).exec();

  const swept = await paidService.reconcileLapsed(new Date(), 100);
  check(swept === 1, 'one period was reconciled', swept);
  check(
    (await UserModel.findById(account.userId).select('planCode').lean().exec())?.planCode === 'free',
    'the account is now on Free',
  );
  check(
    (await SubscriptionModel.countDocuments({ user: account.userId, status: 'active' }).exec()) === 0,
    'with no active paid period left',
  );
  check(await paidService.reconcileLapsed(new Date(), 100) === 0, 'and running it again is a no-op');

  section('Project capacity is enforced by the server, not by a hidden button');

  const overLimit = await entitlements.wouldExceed(userId, 'activeProjects', 5);
  check(overLimit, 'the boundary refuses a sixth project on Free');
  check(!(await entitlements.wouldExceed(userId, 'activeProjects', 4)), 'and allows a fifth');
  check(
    !(await entitlements.wouldExceed(userId, 'tasksPerProject', 10_000)),
    'an unlimited limit never exceeds, however large the count',
  );

  await SubscriptionModel.deleteMany({ user: { $in: [account.userId, otherAccount.userId] } }).exec();
  await CheckoutModel.deleteMany({ user: { $in: [account.userId, otherAccount.userId] } }).exec();
  await cleanUp(MARKER);

  // The catalogue is seed data other work depends on, so it is left in place rather than removed.
  check(
    (await PlanModel.countDocuments().exec()) === PLAN_CATALOGUE.length,
    'the seeded catalogue is left intact',
  );

  return finish(harness);
};

void run();