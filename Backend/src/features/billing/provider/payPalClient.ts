export interface PayPalSettings {
  readonly clientId: string;
  readonly clientSecret: string;
  readonly webhookId: string;
  readonly baseUrl: string;
  readonly timeoutMs: number;
}

export interface PayPalClient {
  readonly settings: PayPalSettings;
  request<T>(method: 'GET' | 'POST', path: string, body?: Record<string, unknown>): Promise<T>;
}

/** Refreshed this long before it expires, so a token cannot lapse mid-request. */
const REFRESH_MARGIN_MS = 60_000;

interface TokenResponse {
  readonly access_token?: string;
  readonly expires_in?: number;
}

/**
 * The authenticated HTTP client both the adapter and the provisioning script talk to PayPal with.
 *
 * The access token is cached until shortly before it expires. PayPal rate-limits token issuance,
 * and minting one per request would spend most of the timeout budget on authentication.
 */
export const createPayPalClient = (settings: PayPalSettings): PayPalClient => {
  let token: string | null = null;
  let expiresAt = 0;

  const authorization = Buffer.from(`${settings.clientId}:${settings.clientSecret}`).toString(
    'base64',
  );

  const accessToken = async (): Promise<string> => {
    if (token !== null && Date.now() < expiresAt) return token;

    const response = await fetch(`${settings.baseUrl}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${authorization}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(settings.timeoutMs),
    });

    if (!response.ok) {
      // The status alone. An error body from the token endpoint can echo the credentials sent.
      throw new Error(`PayPal token request answered ${response.status}`);
    }

    const body = (await response.json()) as TokenResponse;
    if (body.access_token === undefined) throw new Error('PayPal returned no access token.');

    token = body.access_token;
    expiresAt = Date.now() + (body.expires_in ?? 0) * 1000 - REFRESH_MARGIN_MS;

    return token;
  };

  return {
    settings,

    async request<T>(
      method: 'GET' | 'POST',
      path: string,
      body?: Record<string, unknown>,
    ): Promise<T> {
      const response = await fetch(`${settings.baseUrl}${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${await accessToken()}`,
          'Content-Type': 'application/json',
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(settings.timeoutMs),
      });

      if (!response.ok) throw new Error(`PayPal ${path} answered ${response.status}`);

      if (response.status === 204) return undefined as T;

      return (await response.json()) as T;
    },
  };
};
