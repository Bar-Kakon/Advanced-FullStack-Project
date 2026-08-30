import jwt from 'jsonwebtoken';

import { ACCESS_TOKEN_PURPOSE, type AccessTokenClaims } from './token.types.js';

export interface AccessTokenService {
  issue(userId: string, tokenVersion: number): string;
  /** `null` for every failure — signature, expiry, malformed input, wrong purpose. */
  verify(token: string): AccessTokenClaims | null;
}

interface AccessTokenSettings {
  readonly secret: string;
  readonly ttlSeconds: number;
}

const hasAccessClaims = (payload: unknown): payload is AccessTokenClaims => {
  if (typeof payload !== 'object' || payload === null) return false;

  const claims = payload as AccessTokenClaims;
  // A missing `ver` is a token minted before the claim existed, which the middleware reads as 0.
  const version = claims.ver;
  return (
    typeof claims.sub === 'string' &&
    claims.typ === ACCESS_TOKEN_PURPOSE &&
    typeof claims.iat === 'number' &&
    (version === undefined || (typeof version === 'number' && Number.isInteger(version)))
  );
};

/**
 * Owns Access Token cryptography and nothing else. It reports failure as `null` rather than an
 * HTTP error, so the same service serves any caller that has its own idea of what a rejection means.
 */
export const createAccessTokenService = ({ secret, ttlSeconds }: AccessTokenSettings): AccessTokenService => ({
  issue(userId, tokenVersion) {
    // `iat` is added by `sign`; it is claimed back on the way in, not set on the way out.
    return jwt.sign({ sub: userId, typ: ACCESS_TOKEN_PURPOSE, ver: tokenVersion }, secret, {
      expiresIn: ttlSeconds,
    });
  },

  verify(token) {
    try {
      const payload = jwt.verify(token, secret);
      return hasAccessClaims(payload) ? payload : null;
    } catch {
      return null;
    }
  },
});
