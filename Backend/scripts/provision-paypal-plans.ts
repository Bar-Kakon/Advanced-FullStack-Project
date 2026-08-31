/**
 * Registers the paid tiers with PayPal and records what PayPal calls them.
 *
 * Idempotent: a tier that already carries a `providerPlans.paypal` binding at the current price is
 * left alone, and a tier whose catalogue price has moved gets a NEW PayPal plan, because a PayPal
 * Billing Plan's price is fixed at creation. Free is never registered — it is not sold.
 *
 *   npm run provision:paypal-plans
 */
import { config as loadEnvFile } from 'dotenv';

import { loadConfig } from '../src/config/env.js';
import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { planRepository } from '../src/features/billing/plan.repository.js';
import { DEFAULT_PLAN_CODE } from '../src/features/billing/planCatalogue.js';
import { createPayPalClient } from '../src/features/billing/provider/payPalClient.js';
import type { Currency, PlanRecord } from '../src/features/billing/plan.model.js';

loadEnvFile({ quiet: true });

/** The same currency the subscription lifecycle quotes every sale in. */
const CURRENCY: Currency = 'ILS';

const PRODUCT_NAME = 'FieldSync subscription';

interface ProductResponse {
  readonly id?: string;
}

interface PlanResponse {
  readonly id?: string;
}

const priceOf = (plan: PlanRecord): { amountMinor: number; taxIncluded: boolean } => {
  const row = plan.prices.find((price) => price.currency === CURRENCY);
  if (row === undefined) throw new Error(`Plan ${plan.code} has no ${CURRENCY} price.`);
  return { amountMinor: row.amountMinor, taxIncluded: row.taxIncluded };
};

const majorUnits = (amountMinor: number): string => (amountMinor / 100).toFixed(2);

const run = async (): Promise<void> => {
  const config = loadConfig();

  if (config.billing.provider !== 'paypal') {
    throw new Error(
      'PayPal is not configured. Set PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET and ' +
        'PAYPAL_WEBHOOK_ID before provisioning.',
    );
  }

  await connectToDatabase(config.mongoUri);

  const client = createPayPalClient({
    clientId: config.billing.clientId,
    clientSecret: config.billing.clientSecret,
    webhookId: config.billing.webhookId,
    baseUrl: config.billing.baseUrl,
    timeoutMs: config.billing.timeoutMs,
  });

  await planRepository.seedMissing();
  const plans = await planRepository.findActive();
  const paid = plans.filter((plan) => plan.code !== DEFAULT_PLAN_CODE);

  // One Product covers every tier: PayPal models the tiers as plans beneath it, and a second
  // product would make the two ladders impossible to reconcile in its dashboard.
  let productId = paid.find((plan) => plan.providerPlans?.paypal != null)?.providerPlans?.paypal
    ?.productId;

  if (productId === undefined) {
    const product = await client.request<ProductResponse>('POST', '/v1/catalogs/products', {
      name: PRODUCT_NAME,
      type: 'SERVICE',
      category: 'SOFTWARE',
    });
    if (product.id === undefined) throw new Error('PayPal returned no product id.');
    productId = product.id;
    console.log(`Created PayPal product ${productId}`);
  } else {
    console.log(`Reusing PayPal product ${productId}`);
  }

  for (const plan of paid) {
    const { amountMinor, taxIncluded } = priceOf(plan);
    const existing = plan.providerPlans?.paypal ?? null;

    if (existing !== null && existing.currency === CURRENCY) {
      console.log(`  ${plan.code.padEnd(8)} already registered as ${existing.planId}`);
      continue;
    }

    const created = await client.request<PlanResponse>('POST', '/v1/billing/plans', {
      product_id: productId,
      name: `FieldSync ${plan.code}`,
      status: 'ACTIVE',
      billing_cycles: [
        {
          frequency: { interval_unit: 'MONTH', interval_count: 1 },
          tenure_type: 'REGULAR',
          sequence: 1,
          // Zero means "until cancelled", which is what a subscription with no end date is.
          total_cycles: 0,
          pricing_scheme: {
            fixed_price: { value: majorUnits(amountMinor), currency_code: CURRENCY },
          },
        },
      ],
      payment_preferences: { auto_bill_outstanding: true },
      taxes: { percentage: '0', inclusive: taxIncluded },
    });

    if (created.id === undefined) throw new Error(`PayPal returned no plan id for ${plan.code}.`);

    await planRepository.setPayPalPlan(plan.code, {
      productId,
      planId: created.id,
      currency: CURRENCY,
    });

    console.log(
      `  ${plan.code.padEnd(8)} registered as ${created.id} at ${CURRENCY} ${majorUnits(amountMinor)}`,
    );
  }

  await disconnectFromDatabase();
};

run().catch(async (error: unknown) => {
  console.error(error);
  await disconnectFromDatabase();
  process.exit(1);
});
