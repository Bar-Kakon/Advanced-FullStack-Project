import type { Request, RequestHandler, Response } from 'express';

import { getValidated } from '../../middleware/validateRequest.js';
import { getAuthenticatedUserId } from '../auth/requireAccessToken.middleware.js';
import type { UserRepository } from '../users/user.repository.js';
import { toCurrentPlanDto, toPlanDto, toSubscriptionDto } from './billing.dto.js';
import type { PlanSelectionBody } from './billing.validation.js';
import type { SubscriptionService } from './subscription.service.js';
import { unauthenticated } from '../auth/auth.errors.js';

export interface BillingController {
  readonly handlePlans: RequestHandler;
  readonly handleCurrentPlan: RequestHandler;
  readonly handleHistory: RequestHandler;
  readonly handleCheckout: RequestHandler;
  readonly handleScheduleChange: RequestHandler;
  readonly handleKeepCurrentPlan: RequestHandler;
  readonly handleProviderEvent: RequestHandler;
}

export interface BillingControllerDependencies {
  readonly subscriptions: SubscriptionService;
  readonly users: UserRepository;
}

/** Express keeps the received bytes here, set by the raw-body verifier on the webhook route. */
export interface RawBodyRequest extends Request {
  rawBody?: Buffer;
}

export const createBillingController = ({
  subscriptions,
  users,
}: BillingControllerDependencies): BillingController => ({
  /** Public catalogue data. It names no person and reveals nothing about any account. */
  handlePlans: async (req: Request, res: Response) => {
    const plans = await subscriptions.catalogue();

    res.json({ plans: plans.map(toPlanDto) });
  },

  /**
   * The caller's own plan, and only ever their own: the id comes from the verified Access Token,
   * so there is no parameter naming whose subscription to read and none can be supplied.
   */
  handleCurrentPlan: async (req: Request, res: Response) => {
    const view = await subscriptions.currentPlan(getAuthenticatedUserId(res));

    res.json(toCurrentPlanDto(view));
  },

  handleHistory: async (req: Request, res: Response) => {
    const periods = await subscriptions.history(getAuthenticatedUserId(res));

    res.json({ periods: periods.map(toSubscriptionDto) });
  },

  /**
   * Answers where to send the browser, never an entitlement. The tier is not granted here and
   * cannot be: only a confirmed provider event activates a paid plan.
   */
  handleCheckout: async (req: Request, res: Response) => {
    const { planCode } = getValidated<PlanSelectionBody>(res, 'body');
    const userId = getAuthenticatedUserId(res);

    const user = await users.findById(userId);
    if (user === null) throw unauthenticated();

    const { redirectUrl } = await subscriptions.startCheckout(
      { userId, email: user.email, fullName: `${user.firstName} ${user.lastName}` },
      planCode,
    );

    res.json({ redirectUrl });
  },

  handleScheduleChange: async (req: Request, res: Response) => {
    const { planCode } = getValidated<PlanSelectionBody>(res, 'body');
    await subscriptions.scheduleChange(getAuthenticatedUserId(res), planCode);

    res.json({ status: 'scheduled' });
  },

  handleKeepCurrentPlan: async (req: Request, res: Response) => {
    await subscriptions.keepCurrentPlan(getAuthenticatedUserId(res));

    res.json({ status: 'ok' });
  },

  /**
   * The provider callback. Unauthenticated by nature — the provider holds no session — so the
   * signature over the received bytes is the whole of its authentication.
   *
   * It answers 200 for everything it understood, including an event it deliberately ignored,
   * because a provider retries anything else and a duplicate must not be invited. A body that
   * fails verification gets 400 and touches nothing.
   */
  handleProviderEvent: async (req: RawBodyRequest, res: Response) => {
    const rawBody = req.rawBody;
    if (rawBody === undefined) {
      res.status(400).json({ code: 'INVALID_PROVIDER_EVENT', message: 'Unreadable event body' });
      return;
    }

    const applied = await subscriptions.applyProviderEvent(
      rawBody,
      req.headers as Record<string, string | undefined>,
    );

    res.status(200).json({ status: applied ? 'applied' : 'ignored' });
  },
});
