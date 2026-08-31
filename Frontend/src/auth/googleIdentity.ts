/**
 * Loading Google Identity Services, and nothing else.
 *
 * The browser's only job in this flow is to obtain an ID token and hand it to our API. It never
 * decides who is signed in: the token is a signed assertion the server verifies against Google's
 * published keys, so anything this file produced by itself would be refused.
 *
 * The client id is a public identifier rather than a secret, which is why it may be shipped here
 * at all. There is no client secret anywhere in the browser bundle, and no token exchange.
 */

const SCRIPT_SRC = 'https://accounts.google.com/gsi/client';
const SCRIPT_ID = 'google-identity-services';

/** Absent is a supported state: the button is simply not rendered, and password sign-in is intact. */
export const googleClientId = (): string | undefined => {
  const value: unknown = import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
};

export interface GoogleCredentialResponse {
  readonly credential?: string;
}

export interface GoogleButtonOptions {
  readonly type: 'standard';
  readonly theme: 'outline';
  readonly size: 'large';
  readonly shape: 'rectangular';
  readonly text: 'continue_with' | 'signup_with';
  readonly logo_alignment: 'center';
  readonly locale: string;
  readonly width: number;
}

interface GoogleIdentityApi {
  initialize(options: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select: boolean;
    cancel_on_tap_outside: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: GoogleButtonOptions): void;
}

interface GoogleGlobal {
  readonly accounts?: { readonly id?: GoogleIdentityApi };
}

let pending: Promise<GoogleIdentityApi | null> | null = null;

/**
 * Loads the script once per page, however many screens ask for it. A second Login mount reuses the
 * same promise rather than injecting another tag.
 */
export const loadGoogleIdentity = (): Promise<GoogleIdentityApi | null> => {
  if (googleClientId() === undefined) return Promise.resolve(null);
  if (pending !== null) return pending;

  pending = new Promise<GoogleIdentityApi | null>((resolve) => {
    const ready = (): void => resolve((window as { google?: GoogleGlobal }).google?.accounts?.id ?? null);

    const existing = document.getElementById(SCRIPT_ID);
    if (existing !== null) {
      existing.addEventListener('load', ready, { once: true });
      // Already finished loading before this screen mounted.
      if ((window as { google?: GoogleGlobal }).google?.accounts?.id !== undefined) ready();
      return;
    }

    const script = document.createElement('script');
    script.id = SCRIPT_ID;
    script.src = SCRIPT_SRC;
    script.async = true;
    script.defer = true;
    script.addEventListener('load', ready, { once: true });
    // A blocked or offline script resolves null rather than hanging: the screen then renders
    // without the button instead of waiting forever on a promise nobody settles.
    script.addEventListener('error', () => resolve(null), { once: true });
    document.head.appendChild(script);
  });

  return pending;
};