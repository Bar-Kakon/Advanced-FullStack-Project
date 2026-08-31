import type {
  BillingProvider,
  CheckoutRequest,
  CheckoutSession,
  ProviderEvent,
  ProviderEventKind,
  RevisedSubscription,
} from './billingProvider.port.js';
import { createPayPalClient, type PayPalClient, type PayPalSettings } from './payPalClient.js';

interface PayPalLink {
  readonly rel?: string;
  readonly href?: string;
}

interface SubscriptionResponse {
  readonly id?: string;
  readonly status?: string;
  readonly plan_id?: string;
  readonly links?: readonly PayPalLink[];
}

interface VerificationResponse {
  readonly verification_status?: string;
}

interface WebhookEnvelope {
  readonly event_type?: string;
  readonly resource?: {
    readonly id?: string;
    readonly plan_id?: string;
    readonly billing_agreement_id?: string;
  };
}

/** A subscription PayPal is currently billing. */
const ACTIVE_STATUS = 'ACTIVE';

/** PayPal's own event names, mapped onto the vocabulary the lifecycle above already speaks. */
const EVENT_KINDS: Readonly<Record<string, ProviderEventKind>> = {
  'BILLING.SUBSCRIPTION.ACTIVATED': 'activated',
  'BILLING.SUBSCRIPTION.UPDATED': 'updated',
  'PAYMENT.SALE.COMPLETED': 'renewed',
  'BILLING.SUBSCRIPTION.CANCELLED': 'canceled',
  'BILLING.SUBSCRIPTION.EXPIRED': 'canceled',
  'BILLING.SUBSCRIPTION.SUSPENDED': 'canceled',
  'BILLING.SUBSCRIPTION.PAYMENT.FAILED': 'failed',
};

const linkHref = (links: readonly PayPalLink[] | undefined, rel: string): string | null =>
  links?.find((link) => link.rel === rel)?.href ?? null;

/**
 * The certificate PayPal signed with must be served by PayPal.
 *
 * The verification call is the real authority, and this is checked first so a forged callback
 * cannot make this server fetch an address of the sender's choosing.
 */
const isPayPalCertificate = (certUrl: string): boolean => {
  try {
    const { protocol, hostname } = new URL(certUrl);
    return protocol === 'https:' && (hostname === 'paypal.com' || hostname.endsWith('.paypal.com'));
  } catch {
    return false;
  }
};

const splitName = (fullName: string): { given_name: string; surname: string } => {
  const parts = fullName.trim().split(/\s+/);
  const surname = parts.length > 1 ? (parts.pop() as string) : '';
  return { given_name: parts.join(' '), surname };
};

/**
 * The PayPal Subscriptions adapter.
 *
 * Everything specific to this provider — the OAuth token, the event names, the header names, the
 * approval links — is here and nowhere else. The lifecycle above it never learns any of it.
 */
export const createPayPalProvider = (
  settings: PayPalSettings,
  client: PayPalClient = createPayPalClient(settings),
): BillingProvider => ({
  name: 'paypal',
  canCheckout: true,

  /**
   * Opens a PayPal subscription against the Billing Plan the catalogue names. The amount is not
   * sent: PayPal charges what its own plan says, which is what the provisioning script created
   * from this tier's price.
   */
  async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
    if (request.providerPlanId === null) {
      throw new Error(`Plan ${request.planCode} has no PayPal plan id.`);
    }

    const body = await client.request<SubscriptionResponse>('POST', '/v1/billing/subscriptions', {
      plan_id: request.providerPlanId,
      subscriber: {
        name: splitName(request.customerName),
        email_address: request.customerEmail,
      },
      application_context: {
        user_action: 'SUBSCRIBE_NOW',
        return_url: request.successUrl,
        cancel_url: request.failureUrl,
      },
    });

    const providerReference = body.id;
    const redirectUrl = linkHref(body.links, 'approve');
    if (providerReference === undefined || redirectUrl === null) {
      throw new Error('PayPal did not return an approval link.');
    }

    return { providerReference, redirectUrl };
  },

  /**
   * PayPal verifies its own signature: the transmission headers and the received body are handed
   * back to it, and only `SUCCESS` is treated as authentic. There is no local secret to check
   * against, so a callback this server cannot get verified changes nothing.
   */
  async verifyEvent(rawBody, headers): Promise<ProviderEvent | null> {
    const certUrl = headers['paypal-cert-url'];
    const transmissionId = headers['paypal-transmission-id'];
    const transmissionSig = headers['paypal-transmission-sig'];
    const transmissionTime = headers['paypal-transmission-time'];
    const authAlgo = headers['paypal-auth-algo'];

    if (
      certUrl === undefined ||
      transmissionId === undefined ||
      transmissionSig === undefined ||
      transmissionTime === undefined ||
      authAlgo === undefined ||
      !isPayPalCertificate(certUrl)
    ) {
      return null;
    }

    let envelope: WebhookEnvelope;
    try {
      envelope = JSON.parse(rawBody.toString('utf8')) as WebhookEnvelope;
    } catch {
      return null;
    }

    const kind = EVENT_KINDS[envelope.event_type ?? ''];
    if (kind === undefined) return null;

    let verification: VerificationResponse;
    try {
      verification = await client.request<VerificationResponse>(
        'POST',
        '/v1/notifications/verify-webhook-signature',
        {
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: transmissionTime,
          webhook_id: client.settings.webhookId,
          webhook_event: envelope,
        },
      );
    } catch {
      return null;
    }

    if (verification.verification_status !== 'SUCCESS') return null;

    // A recurring charge names its subscription on a different field from every other event.
    const providerReference =
      kind === 'renewed' ? envelope.resource?.billing_agreement_id : envelope.resource?.id;
    if (providerReference === undefined || providerReference.length === 0) return null;

    return {
      kind,
      providerReference,
      transactionId: kind === 'renewed' ? (envelope.resource?.id ?? null) : null,
      providerPlanId: envelope.resource?.plan_id ?? null,
    };
  },

  /**
   * The callback is already verified, and this asks anyway. What activates a paid plan is what
   * PayPal says when asked directly, so a replayed body cannot be the whole story.
   */
  async confirmActive(providerReference) {
    const body = await client.request<SubscriptionResponse>(
      'GET',
      `/v1/billing/subscriptions/${encodeURIComponent(providerReference)}`,
    );

    return body.status === ACTIVE_STATUS;
  },

  async cancelSubscription(providerReference, reason) {
    await client.request(
      'POST',
      `/v1/billing/subscriptions/${encodeURIComponent(providerReference)}/cancel`,
      { reason },
    );
  },

  /**
   * Moves an existing subscription onto another Billing Plan. PayPal answers with an approval
   * link when the payer has to agree to the new terms, and with none when it applied the change
   * outright — the caller decides what to do about each.
   */
  async reviseSubscription(providerReference, providerPlanId): Promise<RevisedSubscription> {
    const body = await client.request<SubscriptionResponse>(
      'POST',
      `/v1/billing/subscriptions/${encodeURIComponent(providerReference)}/revise`,
      { plan_id: providerPlanId },
    );

    return { approvalUrl: linkHref(body.links, 'approve') };
  },
});