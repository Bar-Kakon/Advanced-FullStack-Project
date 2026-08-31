import type { Currency, PlanCode } from '../plan.model.js';
import type { BillingProviderName } from '../subscription.model.js';

export interface CheckoutRequest {
  readonly planCode: PlanCode;
  readonly currency: Currency;
  readonly amountMinor: number;
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

/** What a verified provider callback resolves to once the payload has been read. */
export interface ProviderEvent {
  readonly providerReference: string;
  readonly transactionId: string | null;
  readonly paid: boolean;
}

/**
 * The boundary every provider-specific detail stays behind.
 *
 * Nothing outside this folder knows which provider is configured, what its headers are called, or
 * what shape its callbacks take. The subscription lifecycle asks for a checkout and is handed a
 * reference and a URL; it verifies an event and is handed a reference and whether it was paid.
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
  verifyEvent(rawBody: Buffer, headers: Readonly<Record<string, string | undefined>>): ProviderEvent | null;
  /**
   * Asks the provider what it thinks the state of this attempt is, rather than believing the
   * payload that arrived. Provider state is what activates a paid plan.
   */
  confirmPaid(providerReference: string): Promise<boolean>;
}
