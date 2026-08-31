import { Router, type RequestHandler } from 'express';

import { validateRequest } from '../../middleware/validateRequest.js';
import type { BillingController } from './billing.controller.js';
import { planSelectionBodySchema } from './billing.validation.js';

/**
 * Every route that touches an account is authenticated, and none of them takes an id: the caller's
 * own token names whose subscription this is, so one person cannot read or move another's.
 *
 * `/provider-events` is the exception and is unauthenticated by nature — the payment provider
 * holds no session. Its authentication is the signature over the bytes it sent, checked inside the
 * provider adapter.
 */
export const createBillingRouter = (
  controller: BillingController,
  requireAccessToken: RequestHandler,
  rawJson: RequestHandler,
): Router => {
  const router = Router();

  // The catalogue names nobody. Approved screen #1 asks for plan information to be reachable, and
  // a price list is not account data.
  router.get('/plans', controller.handlePlans);

  router.get('/me', requireAccessToken, controller.handleCurrentPlan);
  router.get('/me/history', requireAccessToken, controller.handleHistory);

  router.post(
    '/me/checkout',
    requireAccessToken,
    validateRequest({ body: planSelectionBodySchema }),
    controller.handleCheckout,
  );

  // Downgrade and cancellation are the same operation with different targets, so they are the same
  // route: cancelling is scheduling a change to Free.
  router.post(
    '/me/scheduled-change',
    requireAccessToken,
    validateRequest({ body: planSelectionBodySchema }),
    controller.handleScheduleChange,
  );
  router.delete('/me/scheduled-change', requireAccessToken, controller.handleKeepCurrentPlan);

  // Its own JSON parser, because the signature covers the bytes as received and a body already
  // parsed and re-serialised is no longer those bytes.
  router.post('/provider-events', rawJson, controller.handleProviderEvent);

  return router;
};
