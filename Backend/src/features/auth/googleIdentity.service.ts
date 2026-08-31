import { OAuth2Client } from 'google-auth-library';

/**
 * A Google identity the server has verified for itself. `subject` is Google's stable id for the
 * person and is what an account is linked by; the email travels with it for display and for the
 * collision check, and is never the link itself.
 */
export interface GoogleIdentity {
  readonly subject: string;
  readonly email: string;
  readonly emailVerified: boolean;
  readonly firstName: string;
  readonly lastName: string;
}

export interface GoogleIdentityService {
  /** `null` for anything that is not a live Google ID token issued for this client. */
  verify(idToken: string): Promise<GoogleIdentity | null>;
}

/**
 * The only place a Google credential is inspected.
 *
 * `verifyIdToken` checks the RS256 signature against Google's published keys, that the issuer is
 * Google, that the audience is this deployment's client id, and that the token has not expired.
 * Nothing the browser sends is believed on its own — a client that posts a hand-written payload
 * fails the signature check and gets the same answer as one that posts nothing.
 */
export const createGoogleIdentityService = (clientId: string): GoogleIdentityService => {
  const client = new OAuth2Client(clientId);

  return {
    async verify(idToken) {
      try {
        const ticket = await client.verifyIdToken({ idToken, audience: clientId });
        const payload = ticket.getPayload();
        if (payload === undefined) return null;

        const { sub, email, email_verified: emailVerified, given_name: given, family_name: family } = payload;
        if (typeof sub !== 'string' || sub.length === 0) return null;
        if (typeof email !== 'string' || email.length === 0) return null;

        return {
          subject: sub,
          email: email.trim().toLowerCase(),
          emailVerified: emailVerified === true,
          firstName: (given ?? '').trim(),
          lastName: (family ?? '').trim(),
        };
      } catch {
        // A forged, expired, wrong-audience or malformed credential are all the same event here:
        // this server could not verify it, so it has no identity to offer.
        return null;
      }
    },
  };
};
