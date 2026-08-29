import jwt from 'jsonwebtoken';

import { ACCESS_TOKEN_PURPOSE, type AccessTokenClaims } from './token.types.js';

export interface AccessTokenService {
  issue(userId: string): string;
  /** `null` for every failure — signature, expiry, malformed input, wrong purpose. */
  verify(token: string): AccessTokenClaims | null;
}

interface AccessTokenSettings {
  readonly secret: string;
  readonly ttlSeconds: number;
}

const hasAccessClaims = (payload: unknown): payload is AccessTokenClaims =>
  typeof payload === 'object' &&
  payload !== null &&
  typeof (payload as AccessTokenClaims).sub === 'string' &&
  (payload as AccessTokenClaims).typ === ACCESS_TOKEN_PURPOSE &&
  typeof (payload as AccessTokenClaims).iat === 'number';

/**
 * Owns Access Token cryptography and nothing else. It reports failure as `null` rather than an
 * HTTP error, so the same service serves any caller that has its own idea of what a rejection means.
 */
export const createAccessTokenService = ({ secret, ttlSeconds }: AccessTokenSettings): AccessTokenService => ({
  issue(userId) {
    // `iat` is added by `sign`; it is claimed back on the way in, not set on the way out.
    return jwt.sign({ sub: userId, typ: ACCESS_TOKEN_PURPOSE }, secret, { expiresIn: ttlSeconds });
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
