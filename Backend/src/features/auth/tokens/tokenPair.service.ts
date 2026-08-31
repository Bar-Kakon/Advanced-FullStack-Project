import type { RefreshTokenRepository } from '../refreshToken.repository.js';
import type { AccessTokenService } from './accessToken.service.js';
import type { RefreshTokenService } from './refreshToken.service.js';

export interface TokenPair {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface IssueTokenPair {
  readonly userId: string;
  /** Stamped on the Access Token, so a later increment retires everything issued before it. */
  readonly tokenVersion: number;
  /** Omit to open a new session; pass one to continue the chain a login already opened. */
  readonly family?: string;
}

export interface TokenPairService {
  issue(input: IssueTokenPair): Promise<TokenPair>;
}

export interface TokenPairDependencies {
  readonly accessTokens: AccessTokenService;
  readonly refreshTokens: RefreshTokenService;
  readonly refreshTokenStore: RefreshTokenRepository;
}

/**
 * Signing a pair and recording the Refresh Token side of it is one indivisible step: a token handed
 * out but never stored can never be rotated or revoked. Extracted from the login flow so Register
 * opens a session through this exact path instead of assembling a second one that could drift from
 * it — the family, the SHA-256 storage and the TTL are decided in one place for both.
 */
export const createTokenPairService = ({
  accessTokens,
  refreshTokens,
  refreshTokenStore,
}: TokenPairDependencies): TokenPairService => ({
  async issue({ userId, tokenVersion, family }) {
    const refresh = refreshTokens.issue(userId, family);

    await refreshTokenStore.save({
      tokenHash: refreshTokenStore.hash(refresh.token),
      userId,
      family: refresh.family,
      expiresAt: refresh.expiresAt,
    });

    return { accessToken: accessTokens.issue(userId, tokenVersion), refreshToken: refresh.token };
  },
});
