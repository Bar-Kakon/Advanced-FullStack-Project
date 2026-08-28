import type { UserRecord } from '../users/user.model.js';
import type { UserRepository } from '../users/user.repository.js';
import { invalidCredentials, invalidRefreshToken } from './auth.errors.js';
import { toAuthenticatedUser, type AuthenticatedUser } from './authenticatedUser.mapper.js';
import type { PasswordService } from './password.service.js';
import type { RefreshTokenRepository } from './refreshToken.repository.js';
import type { LoginBody } from './auth.validation.js';
import type { RefreshTokenService } from './tokens/refreshToken.service.js';
import type { TokenPair, TokenPairService } from './tokens/tokenPair.service.js';

export interface LoginResult extends TokenPair {
  readonly user: AuthenticatedUser;
}

export interface AuthService {
  login(credentials: LoginBody): Promise<LoginResult>;
  refresh(rawRefreshToken: string | undefined): Promise<TokenPair>;
}

export interface AuthServiceDependencies {
  readonly users: UserRepository;
  readonly passwords: PasswordService;
  readonly refreshTokens: RefreshTokenService;
  readonly refreshTokenStore: RefreshTokenRepository;
  readonly tokenPair: TokenPairService;
}

/** Only an `active` account may hold a session; D8 has not defined what the other states may do. */
export const isSessionPermitted = (user: UserRecord): boolean => user.status === 'active';

export const createAuthService = ({
  users,
  passwords,
  refreshTokens,
  refreshTokenStore,
  tokenPair,
}: AuthServiceDependencies): AuthService => ({
  /**
   * Order matters: the password is compared *before* the status is inspected, so a banned account
   * and an active one with a wrong password take the same path and the same time.
   */
  async login({ email, password }) {
    const user = await users.findByEmailWithPasswordHash(email);

    if (user === null) {
      await passwords.simulateVerify();
      throw invalidCredentials();
    }

    const passwordMatches = await passwords.verify(password, user.passwordHash);
    if (!passwordMatches || !isSessionPermitted(user)) {
      throw invalidCredentials();
    }

    const tokens = await tokenPair.issue(user._id.toString());
    return { ...tokens, user: toAuthenticatedUser(user) };
  },

  /**
   * Rotation with reuse detection. Each Refresh Token may be spent exactly once; presenting one
   * that was already spent means a copy is in circulation, so the entire family descended from
   * that login is revoked rather than only the replayed token.
   */
  async refresh(rawRefreshToken) {
    if (rawRefreshToken === undefined) throw invalidRefreshToken();

    const claims = refreshTokens.verify(rawRefreshToken);
    if (claims === null) throw invalidRefreshToken();

    const stored = await refreshTokenStore.findByHash(refreshTokenStore.hash(rawRefreshToken));
    if (stored === null || stored.revokedAt !== null) throw invalidRefreshToken();

    if (stored.usedAt !== null) {
      await refreshTokenStore.revokeFamily(stored.family);
      throw invalidRefreshToken();
    }

    const user = await users.findById(claims.sub);
    if (user === null || !isSessionPermitted(user)) throw invalidRefreshToken();

    await refreshTokenStore.markUsed(stored._id);
    return tokenPair.issue(user._id.toString(), stored.family);
  },
});
