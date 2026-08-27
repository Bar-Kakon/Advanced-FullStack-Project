import type { UserRecord } from '../users/user.model.js';
import type { UserRepository } from '../users/user.repository.js';
import { invalidCredentials, invalidRefreshToken } from './auth.errors.js';
import { toAuthenticatedUser, type AuthenticatedUser } from './authenticatedUser.mapper.js';
import type { PasswordService } from './password.service.js';
import type { RefreshTokenRepository } from './refreshToken.repository.js';
import type { LoginBody } from './auth.validation.js';
import type { AccessTokenService } from './tokens/accessToken.service.js';
import type { RefreshTokenService } from './tokens/refreshToken.service.js';

export interface AuthTokens {
  readonly accessToken: string;
  readonly refreshToken: string;
}

export interface LoginResult extends AuthTokens {
  readonly user: AuthenticatedUser;
}

export interface AuthService {
  login(credentials: LoginBody): Promise<LoginResult>;
  refresh(rawRefreshToken: string | undefined): Promise<AuthTokens>;
}

export interface AuthServiceDependencies {
  readonly users: UserRepository;
  readonly passwords: PasswordService;
  readonly accessTokens: AccessTokenService;
  readonly refreshTokens: RefreshTokenService;
  readonly refreshTokenStore: RefreshTokenRepository;
}

/** Only an `active` account may hold a session; D8 has not defined what the other states may do. */
const isLoginPermitted = (user: UserRecord): boolean => user.status === 'active';

export const createAuthService = ({
  users,
  passwords,
  accessTokens,
  refreshTokens,
  refreshTokenStore,
}: AuthServiceDependencies): AuthService => {
  const issueTokenPair = async (userId: string, family?: string): Promise<AuthTokens> => {
    const refresh = refreshTokens.issue(userId, family);

    await refreshTokenStore.save({
      tokenHash: refreshTokenStore.hash(refresh.token),
      userId,
      family: refresh.family,
      expiresAt: refresh.expiresAt,
    });

    return { accessToken: accessTokens.issue(userId), refreshToken: refresh.token };
  };

  return {
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
      if (!passwordMatches || !isLoginPermitted(user)) {
        throw invalidCredentials();
      }

      const tokens = await issueTokenPair(user._id.toString());
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
      if (user === null || !isLoginPermitted(user)) throw invalidRefreshToken();

      await refreshTokenStore.markUsed(stored._id);
      return issueTokenPair(user._id.toString(), stored.family);
    },
  };
};
