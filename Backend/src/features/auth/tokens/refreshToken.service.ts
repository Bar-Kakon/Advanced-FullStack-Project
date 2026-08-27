import { randomUUID } from 'node:crypto';

import jwt from 'jsonwebtoken';

import { REFRESH_TOKEN_PURPOSE, type IssuedRefreshToken, type RefreshTokenClaims } from './token.types.js';

export interface RefreshTokenService {
  /** Omit `family` to start a new chain; pass one to continue the chain an existing login opened. */
  issue(userId: string, family?: string): IssuedRefreshToken;
  verify(token: string): RefreshTokenClaims | null;
}

interface RefreshTokenSettings {
  readonly secret: string;
  readonly ttlSeconds: number;
}

const hasRefreshClaims = (payload: unknown): payload is RefreshTokenClaims =>
  typeof payload === 'object' &&
  payload !== null &&
  typeof (payload as RefreshTokenClaims).sub === 'string' &&
  typeof (payload as RefreshTokenClaims).jti === 'string' &&
  typeof (payload as RefreshTokenClaims).fam === 'string' &&
  (payload as RefreshTokenClaims).typ === REFRESH_TOKEN_PURPOSE;

/**
 * Deliberately a separate module from the Access Token service rather than one parameterised
 * signer: a shared signer would be one edit away from signing both types with one secret.
 */
export const createRefreshTokenService = ({ secret, ttlSeconds }: RefreshTokenSettings): RefreshTokenService => ({
  issue(userId, family) {
    const jti = randomUUID();
    const claims: RefreshTokenClaims = { sub: userId, typ: REFRESH_TOKEN_PURPOSE, jti, fam: family ?? randomUUID() };

    return {
      token: jwt.sign(claims, secret, { expiresIn: ttlSeconds }),
      jti,
      family: claims.fam,
      expiresAt: new Date(Date.now() + ttlSeconds * 1000),
    };
  },

  verify(token) {
    try {
      const payload = jwt.verify(token, secret);
      return hasRefreshClaims(payload) ? payload : null;
    } catch {
      return null;
    }
  },
});
