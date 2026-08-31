import { AppError } from '../../shared/errors.js';

/** Every deliberate billing failure, in one place. The client renders the `code`. */

/** No payment credentials are configured, so no checkout can be opened on this deployment. */
export const billingProviderNotConfigured = (): AppError =>
  new AppError('Billing is not configured', 503, 'BILLING_PROVIDER_NOT_CONFIGURED');

/** The catalogue holds no active tier under that code. */
export const planNotFound = (): AppError => new AppError('Plan not found', 404, 'PLAN_NOT_FOUND');

/** Free is reached by cancelling or downgrading, never by being sold. */
export const planNotPurchasable = (): AppError =>
  new AppError('This plan cannot be purchased', 409, 'PLAN_NOT_PURCHASABLE');

/** Asking for the tier already held. Nothing to charge for and nothing to schedule. */
export const alreadyOnPlan = (): AppError =>
  new AppError('This is already the current plan', 409, 'ALREADY_ON_PLAN');

/** The provider could not be reached, or answered something unusable. Nothing was charged. */
export const checkoutFailed = (): AppError =>
  new AppError('Checkout could not be started', 502, 'CHECKOUT_FAILED');

/** There is no paid period to cancel or change. */
export const noActiveSubscription = (): AppError =>
  new AppError('No active paid subscription', 409, 'NO_ACTIVE_SUBSCRIPTION');
