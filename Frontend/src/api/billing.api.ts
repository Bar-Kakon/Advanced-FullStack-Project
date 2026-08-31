import { isAxiosError } from 'axios';

import { api } from './client';
import type { ApiErrorBody } from './types';
import type { CheckoutResponse, CurrentPlan, PlanCode, PlansResponse } from './billing.types';

export const fetchPlans = async (): Promise<PlansResponse> => {
  const { data } = await api.get<PlansResponse>('/billing/plans');
  return data;
};

/** The caller's own plan. There is no endpoint that takes somebody else's id. */
export const fetchCurrentPlan = async (): Promise<CurrentPlan> => {
  const { data } = await api.get<CurrentPlan>('/billing/me');
  return data;
};

/**
 * Asks for a payment page. It carries a plan code and no price: the amount is read from the
 * catalogue on the server, so there is nothing here for a client to change.
 *
 * The answer is a URL, never an entitlement. Coming back from the provider does not activate
 * anything either — only the provider's own confirmed callback does.
 */
export const startCheckout = async (planCode: PlanCode): Promise<CheckoutResponse> => {
  const { data } = await api.post<CheckoutResponse>('/billing/me/checkout', { planCode });
  return data;
};

/** Downgrade and cancellation are one call: cancelling is scheduling a change to Free. */
export const schedulePlanChange = async (planCode: PlanCode): Promise<void> => {
  await api.post('/billing/me/scheduled-change', { planCode });
};

export const keepCurrentPlan = async (): Promise<void> => {
  await api.delete('/billing/me/scheduled-change');
};

export type BillingFailure =
  | 'ALREADY_ON_PLAN'
  | 'NOT_PURCHASABLE'
  | 'NO_ACTIVE_SUBSCRIPTION'
  | 'PROVIDER_NOT_CONFIGURED'
  | 'CHECKOUT_FAILED'
  | 'NETWORK'
  | 'UNKNOWN';

export const classifyBillingError = (error: unknown): BillingFailure => {
  if (!isAxiosError(error)) return 'UNKNOWN';
  if (!error.response) return 'NETWORK';

  const body = error.response.data as ApiErrorBody | undefined;
  switch (body?.code) {
    case 'ALREADY_ON_PLAN':
      return 'ALREADY_ON_PLAN';
    case 'PLAN_NOT_PURCHASABLE':
      return 'NOT_PURCHASABLE';
    case 'NO_ACTIVE_SUBSCRIPTION':
      return 'NO_ACTIVE_SUBSCRIPTION';
    case 'BILLING_PROVIDER_NOT_CONFIGURED':
      return 'PROVIDER_NOT_CONFIGURED';
    case 'CHECKOUT_FAILED':
      return 'CHECKOUT_FAILED';
    default:
      return 'UNKNOWN';
  }
};