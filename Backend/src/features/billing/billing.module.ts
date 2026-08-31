import express, { type Router, type RequestHandler } from 'express';

import type { AppConfig } from '../../config/env.js';
import { runInTransaction } from '../../db/mongoose.js';
import { userRepository } from '../users/user.repository.js';
import { createBillingController, type RawBodyRequest } from './billing.controller.js';
import { createBillingRouter } from './billing.routes.js';
import { checkoutRepository } from './checkout.repository.js';
import { createEntitlementService, type EntitlementService } from './entitlements.service.js';
import { planRepository } from './plan.repository.js';
import type { BillingProvider } from './provider/billingProvider.port.js';
import { createUnconfiguredProvider } from './provider/none.adapter.js';
import { createPayPlusProvider } from './provider/payPlus.adapter.js';
import { subscriptionRepository } from './subscription.repository.js';
import { createSubscriptionService, type SubscriptionService } from './subscription.service.js';

export interface BillingModule {
  readonly router: Router;
  /** Exported so other features ask this one boundary rather than reading a plan code themselves. */
  readonly entitlements: EntitlementService;
  /** Exported for the scheduled sweep, which needs the lifecycle without any HTTP surface. */
  readonly subscriptions: SubscriptionService;
}

const WEBHOOK_BODY_LIMIT = '100kb';

/**
 * Keeps the bytes exactly as received alongside the parsed body.
 *
 * The provider signs what it sent. Re-serialising a parsed object can reorder keys and change
 * whitespace, so a signature checked against that is checked against a different message.
 */
const createRawJsonParser = (): RequestHandler =>
  express.json({
    limit: WEBHOOK_BODY_LIMIT,
    verify: (req, _res, buf) => {
      (req as RawBodyRequest).rawBody = Buffer.from(buf);
    },
  });

const providerFor = (config: AppConfig): BillingProvider =>
  config.billing.provider === 'payplus'
    ? createPayPlusProvider({
        apiKey: config.billing.apiKey,
        secretKey: config.billing.secretKey,
        paymentPageUid: config.billing.paymentPageUid,
        baseUrl: config.billing.baseUrl,
        timeoutMs: config.billing.timeoutMs,
      })
    : createUnconfiguredProvider();

/**
 * The billing feature's composition root.
 *
 * The provider is chosen once, here, from configuration. Nothing downstream branches on which one
 * is running: an unconfigured deployment gets a real adapter that refuses checkout, so the Free
 * plan, the catalogue and the current-plan read work identically either way.
 */
export const createBillingModule = (
  config: AppConfig,
  requireAccessToken: RequestHandler,
  apiUrl: string,
): BillingModule => {
  const subscriptions = createSubscriptionService({
    plans: planRepository,
    subscriptions: subscriptionRepository,
    checkouts: checkoutRepository,
    users: userRepository,
    provider: providerFor(config),
    transactions: { run: runInTransaction },
    frontendUrl: config.frontendUrl,
    apiUrl,
  });

  return {
    router: createBillingRouter(
      createBillingController({ subscriptions, users: userRepository }),
      requireAccessToken,
      createRawJsonParser(),
    ),
    entitlements: createEntitlementService({ plans: planRepository, users: userRepository }),
    subscriptions,
  };
};
