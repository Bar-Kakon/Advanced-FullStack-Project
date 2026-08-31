import type { Currency, PlanCode } from '../plan.model.js';
import type { BillingProviderName } from '../subscription.model.js';

export interface CheckoutRequest {
  readonly planCode: PlanCode;
  readonly currency: Currency;
  readonly amountMinor: number;
  /** The provider's own identifier for the tier being bought. */
  readonly providerPlanId: string | null;
  readonly customerName: string;
  readonly customerEmail: string;
  readonly successUrl: string;
  readonly failureUrl: string;
  readonly callbackUrl: string;
}

export interface CheckoutSession {
  /** The provider's own reference for this attempt. The idempotency key a callback is matched on. */
  readonly providerReference: string;
  /** Where the browser is sent to pay. Built by the provider, never by this application. */
  readonly redirectUrl: string;
}

/**
 * What a verified callback means, in this application's own vocabulary rather than the provider's.
 */
export const PROVIDER_EVENT_KINDS = [
  'activated',
  'updated',
  'renewed',
  'canceled',
  'failed',
] as const;
export type ProviderEventKind = (typeof PROVIDER_EVENT_KINDS)[number];

export interface ProviderEvent {
  readonly kind: ProviderEventKind;
  readonly providerReference: string;
  readonly transactionId: string | null;
  /** Which tier the provider now bills this subscription for, on an `updated` event. */
  readonly providerPlanId: string | null;
}

export interface RevisedSubscription {
  /** Where the browser approves the change, or `null` when the provider applied it outright. */
  readonly approvalUrl: string | null;
}

/**
 * The boundary every provider-specific detail stays behind.
 *
 * Nothing outside this folder knows which provider is configured, what its headers are called, or
 * what shape its callbacks take.
 */
export interface BillingProvider {
  readonly name: BillingProviderName;
  /** Whether checkout can actually be opened. `false` for the unconfigured provider. */
  readonly canCheckout: boolean;
  createCheckout(request: CheckoutRequest): Promise<CheckoutSession>;
  /**
   * Proves the callback came from the provider, using the raw bytes as received. `null` for
   * anything that fails verification, which the route answers without touching any subscription.
   */
  verifyEvent(
    rawBody: Buffer,
    headers: Readonly<Record<string, string | undefined>>,
  ): Promise<ProviderEvent | null>;
  /**
   * Asks the provider what it thinks the state of this subscription is, rather than believing the
   * payload that arrived. Provider state is what activates a paid plan.
   */
  confirmActive(providerReference: string): Promise<boolean>;
  /** Stops the provider billing this subscription again. */
  cancelSubscription(providerReference: string, reason: string): Promise<void>;
  /** Moves an existing subscription onto another tier from the next billing cycle. */
  reviseSubscription(
    providerReference: string,
    providerPlanId: string,
  ): Promise<RevisedSubscription>;
}