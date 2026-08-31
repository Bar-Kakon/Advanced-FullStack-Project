import { billingProviderNotConfigured } from '../billing.errors.js';
import type { BillingProvider } from './billingProvider.port.js';

/**
 * What runs when no payment credentials are configured.
 *
 * It is a real adapter rather than a null check scattered through the lifecycle, so every path
 * above it is written once. Free works completely, the plan comparison renders, the current plan
 * reads back — and the two operations that need a provider refuse plainly instead of pretending
 * they worked.
 */
export const createUnconfiguredProvider = (): BillingProvider => ({
  name: 'none',
  canCheckout: false,

  async createCheckout() {
    throw billingProviderNotConfigured();
  },

  // No secret exists to verify a signature against, so nothing can be authentic.
  verifyEvent() {
    return null;
  },

  async confirmPaid() {
    return false;
  },
});
