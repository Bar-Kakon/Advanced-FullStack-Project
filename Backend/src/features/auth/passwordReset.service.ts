import type { DbSession } from '../../db/mongoose.js';
import { buildPasswordResetEmail } from '../../mail/passwordResetEmail.js';
import type { Mailer } from '../../mail/mailer.js';
import { logger } from '../../shared/logger.js';
import type { UserLanguage } from '../users/user.model.js';
import type { UserRepository } from '../users/user.repository.js';
import { invalidResetToken } from './auth.errors.js';
import { isSessionPermitted } from './auth.service.js';
import type { PasswordService } from './password.service.js';
import type { PasswordResetTokenRepository } from './passwordResetToken.repository.js';
import type { RefreshTokenRepository } from './refreshToken.repository.js';

/** 30 minutes, which is what the Forgot password screen already tells people, in both languages. */
export const RESET_TOKEN_TTL_MINUTES = 30;

export interface ForgotPasswordInput {
  readonly email: string;
}

export interface ResetPasswordInput {
  readonly token: string;
  readonly password: string;
}

export interface PasswordResetService {
  requestReset(input: ForgotPasswordInput): Promise<void>;
  resetPassword(input: ResetPasswordInput): Promise<void>;
}

export interface PasswordResetDependencies {
  readonly users: UserRepository;
  readonly passwords: PasswordService;
  readonly resetTokens: PasswordResetTokenRepository;
  readonly refreshTokenStore: RefreshTokenRepository;
  readonly mailer: Mailer;
  readonly frontendUrl: string;
  readonly transactions: { run<T>(work: (session: DbSession) => Promise<T>): Promise<T> };
}

const buildResetUrl = (frontendUrl: string, rawToken: string): string =>
  `${frontendUrl}/reset-password?token=${encodeURIComponent(rawToken)}`;

export const createPasswordResetService = ({
  users,
  passwords,
  resetTokens,
  refreshTokenStore,
  mailer,
  frontendUrl,
  transactions,
}: PasswordResetDependencies): PasswordResetService => {
  /**
   * Off the request path on purpose. Reaching an SMTP relay takes far longer than any database
   * work here, so awaiting it would make a known address answer measurably slower than an unknown
   * one — the enumeration oracle the identical response exists to close.
   */
  const dispatch = (to: string, rawToken: string, language: UserLanguage): void => {
    const resetUrl = buildResetUrl(frontendUrl, rawToken);
    const message = buildPasswordResetEmail(to, {
      resetUrl,
      expiryMinutes: RESET_TOKEN_TTL_MINUTES,
      language,
    });

    // Only when no SMTP is configured, and only because there is then no mailbox to read the link
    // from. A configured server never writes a token to its log.
    if (mailer.mode === 'log') logger.warn('Password reset link (log mode only)', { resetUrl });

    void mailer
      .send(message)
      .then(() => logger.info('Password reset email dispatched', { mode: mailer.mode }))
      .catch((error: unknown) =>
        logger.error('Password reset email failed to send', {
          mode: mailer.mode,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
  };

  return {
    /**
     * Returns the same way for every input. A caller cannot tell an unknown address from a known
     * one, nor an active account from a suspended one.
     */
    async requestReset({ email }) {
      const user = await users.findByEmail(email);
      if (user === null || !isSessionPermitted(user)) return;

      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);
      const { rawToken } = await resetTokens.issueFor(user._id, expiresAt);

      // `users.language` is read here and nowhere near the response: the answer this endpoint
      // gives is identical whether or not the account exists, so it can carry no such fact.
      dispatch(user.email, rawToken, user.language);
    },

    /**
     * Every failure raises the same error, so a caller learns whether the link worked and nothing
     * about why it did not. The three writes commit together: a password changed without its token
     * being spent would leave the link replayable, and one whose token version did not advance
     * would leave every Access Token already in circulation working.
     */
    async resetPassword({ token, password }) {
      const stored = await resetTokens.findByHash(resetTokens.hash(token));

      if (
        stored === null ||
        stored.usedAt !== null ||
        stored.invalidatedAt !== null ||
        stored.expiresAt.getTime() <= Date.now()
      ) {
        throw invalidResetToken();
      }

      const user = await users.findById(stored.user.toString());
      if (user === null || !isSessionPermitted(user)) throw invalidResetToken();

      // Outside the transaction: bcrypt is ~250ms of CPU and must not hold one open.
      const passwordHash = await passwords.hash(password);

      // Security history at full precision. Access Token validity is decided by the token version
      // the same write advances, so nothing compares this against a clock.
      const passwordChangedAt = new Date();

      await transactions.run(async (session) => {
        await users.updatePassword(user._id, { passwordHash, passwordChangedAt }, session);
        await resetTokens.markUsed(stored._id, session);
        await refreshTokenStore.revokeAllForUser(user._id, session);
      });
    },
  };
};
