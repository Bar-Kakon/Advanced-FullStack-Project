/**
 * The `typ` claim is the explicit purpose marker. It is checked after signature verification, so a
 * token is only ever accepted by the flow it was minted for — expiry is never what tells them apart.
 */
export const ACCESS_TOKEN_PURPOSE = 'access';
export const REFRESH_TOKEN_PURPOSE = 'refresh';

import { INITIAL_TOKEN_VERSION } from '../../users/user.model.js';

export interface AccessTokenClaims {
  readonly sub: string;
  readonly typ: typeof ACCESS_TOKEN_PURPOSE;
  /** Issued-at, in whole seconds. Audit only; it decides nothing about validity. */
  readonly iat: number;
  /** The account's token version when this token was minted. Absent on tokens predating the claim. */
  readonly ver?: number;
}

export const accessTokenVersionOf = (claims: AccessTokenClaims): number =>
  claims.ver ?? INITIAL_TOKEN_VERSION;

export interface RefreshTokenClaims {
  readonly sub: string;
  readonly typ: typeof REFRESH_TOKEN_PURPOSE;
  /** Identifies this single token, so one rotation step can be retired without touching the rest. */
  readonly jti: string;
  /** Groups every token descended from one login, so reuse can revoke the whole chain at once. */
  readonly fam: string;
}

export interface IssuedRefreshToken {
  readonly token: string;
  readonly jti: string;
  readonly family: string;
  readonly expiresAt: Date;
}
