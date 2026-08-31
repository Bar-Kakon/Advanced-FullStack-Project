import { createHmac, timingSafeEqual } from 'node:crypto';

import type { BillingProvider, CheckoutRequest, CheckoutSession, ProviderEvent } from './billingProvider.port.js';

export interface PayPlusSettings {
  readonly apiKey: string;
  readonly secretKey: string;
  readonly paymentPageUid: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
}

/** PayPlus quotes amounts in major units, unlike everything stored in this application. */
const MINOR_UNITS_PER_MAJOR = 100;

interface GenerateLinkResponse {
  readonly results?: { readonly status?: string };
  readonly data?: { readonly page_request_uid?: string; readonly payment_page_link?: string };
}

interface IpnResponse {
  readonly results?: { readonly status?: string };
  readonly data?: { readonly status_code?: string; readonly transaction?: { readonly status_code?: string } };
}

/** PayPlus signs the exact body it sent, so the raw bytes are what has to be hashed. */
const signatureOf = (secretKey: string, rawBody: Buffer): Buffer =>
  createHmac('sha256', secretKey).update(rawBody).digest();

/**
 * The documented recipe hashes `JSON.stringify(body)` — the re-serialised object rather than the
 * bytes on the wire. Both are accepted here: the raw form is the one that is actually correct, and
 * the re-serialised form is what the provider's own example produces. Whichever matches, the
 * comparison itself is constant-time.
 */
const canonicalSignatureOf = (secretKey: string, rawBody: Buffer): Buffer | null => {
  try {
    const reserialised = JSON.stringify(JSON.parse(rawBody.toString('utf8')) as unknown);
    return createHmac('sha256', secretKey).update(reserialised).digest();
  } catch {
    return null;
  }
};

const matches = (expected: Buffer, presented: Buffer): boolean =>
  expected.length === presented.length && timingSafeEqual(expected, presented);

/** PayPlus reports a settled transaction with status code `000`. */
const APPROVED_STATUS_CODE = '000';

const readPaid = (payload: Record<string, unknown>): boolean => {
  const statusCode = payload['status_code'];
  if (typeof statusCode === 'string') return statusCode === APPROVED_STATUS_CODE;

  const status = payload['status'];
  return typeof status === 'string' && status.toLowerCase() === 'approved';
};

const readString = (payload: Record<string, unknown>, key: string): string | null => {
  const value = payload[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
};

/**
 * The PayPlus adapter.
 *
 * Everything specific to this provider — the header names, the major-unit amounts, the hosted page
 * flow, the callback signature — is here and nowhere else. The lifecycle above it never learns any
 * of it.
 */
export const createPayPlusProvider = (settings: PayPlusSettings): BillingProvider => {
  const call = async <T>(path: string, body: Record<string, unknown>): Promise<T> => {
    const response = await fetch(`${settings.baseUrl}${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': settings.apiKey,
        'secret-key': settings.secretKey,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(settings.timeoutMs),
    });

    if (!response.ok) {
      // The status alone. A provider error body can carry the echoed request, and this one carried
      // credentials.
      throw new Error(`PayPlus ${path} answered ${response.status}`);
    }

    return (await response.json()) as T;
  };

  return {
    name: 'payplus',
    canCheckout: true,

    async createCheckout(request: CheckoutRequest): Promise<CheckoutSession> {
      const body = await call<GenerateLinkResponse>('/PaymentPages/generateLink', {
        payment_page_uid: settings.paymentPageUid,
        amount: request.amountMinor / MINOR_UNITS_PER_MAJOR,
        currency_code: request.currency,
        sendEmailApproval: true,
        sendEmailFailure: false,
        customer: { customer_name: request.customerName, email: request.customerEmail },
        refURL_success: request.successUrl,
        refURL_failure: request.failureUrl,
        refURL_callback: request.callbackUrl,
        // Travels back on the callback, so a settled payment names the tier it was opened for.
        more_info: request.planCode,
      });

      const providerReference = body.data?.page_request_uid;
      const redirectUrl = body.data?.payment_page_link;
      if (providerReference === undefined || redirectUrl === undefined) {
        throw new Error('PayPlus did not return a payment page.');
      }

      return { providerReference, redirectUrl };
    },

    /**
     * Two independent checks, both required. The user agent is the provider's own marker, and the
     * HMAC over the received bytes is what a forger cannot produce without the secret key.
     */
    verifyEvent(rawBody, headers) {
      if ((headers['user-agent'] ?? '') !== 'PayPlus') return null;

      const header = headers['hash'];
      if (header === undefined || header.length === 0) return null;

      const presented = Buffer.from(header, 'base64');
      const raw = signatureOf(settings.secretKey, rawBody);
      const canonical = canonicalSignatureOf(settings.secretKey, rawBody);

      const verified =
        matches(raw, presented) || (canonical !== null && matches(canonical, presented));
      if (!verified) return null;

      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(rawBody.toString('utf8')) as Record<string, unknown>;
      } catch {
        return null;
      }

      const providerReference =
        readString(payload, 'page_request_uid') ?? readString(payload, 'payment_request_uid');
      if (providerReference === null) return null;

      return {
        providerReference,
        transactionId: readString(payload, 'transaction_uid'),
        paid: readPaid(payload),
      };
    },

    /**
     * The callback is already signed, and this asks anyway. What activates a paid plan is what the
     * provider says when we ask it directly, so a replayed body cannot be the whole story.
     */
    async confirmPaid(providerReference) {
      const body = await call<IpnResponse>('/PaymentPages/ipn', {
        payment_request_uid: providerReference,
      });

      if ((body.results?.status ?? '').toLowerCase() !== 'success') return false;

      const statusCode = body.data?.status_code ?? body.data?.transaction?.status_code;
      return statusCode === APPROVED_STATUS_CODE;
    },
  };
};
