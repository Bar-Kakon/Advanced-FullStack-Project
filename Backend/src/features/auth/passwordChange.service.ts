import type { DbSession } from '../../db/mongoose.js';
import type { UserRepository } from '../users/user.repository.js';
import { currentPasswordIncorrect, noLocalPassword, unauthenticated } from './auth.errors.js';
import { isSessionPermitted } from './auth.service.js';
import type { PasswordService } from './password.service.js';
import type { RefreshTokenRepository } from './refreshToken.repository.js';

export interface PasswordChangeService {
  changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void>;
}

export interface PasswordChangeDependencies {
  readonly users: UserRepository;
  readonly passwords: PasswordService;
  readonly refreshTokenStore: RefreshTokenRepository;
  readonly transactions: { run<T>(work: (session: DbSession) => Promise<T>): Promise<T> };
}

export const createPasswordChangeService = ({
  users,
  passwords,
  refreshTokenStore,
  transactions,
}: PasswordChangeDependencies): PasswordChangeService => ({
  async changePassword(userId, currentPassword, newPassword) {
    const user = await users.findById(userId);
    if (user === null || !isSessionPermitted(user)) throw unauthenticated();

    const currentHash = await users.findPasswordHashById(userId);
    if (currentHash === null) throw noLocalPassword();
    if (!(await passwords.verify(currentPassword, currentHash))) throw currentPasswordIncorrect();

    const passwordHash = await passwords.hash(newPassword);
    const passwordChangedAt = new Date();

    await transactions.run(async (session) => {
      await users.updatePassword(user._id, { passwordHash, passwordChangedAt }, session);
      await refreshTokenStore.revokeAllForUser(user._id, session);
    });
  },
});
