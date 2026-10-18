import type { DbSession } from '../../db/mongoose.js';
import {
  buildEmailChangedNoticeEmail,
  buildEmailChangeVerificationEmail,
} from '../../mail/emailChangeEmail.js';
import type { Mailer, MailMessage } from '../../mail/mailer.js';
import { logger } from '../../shared/logger.js';
import type { UserRepository } from '../users/user.repository.js';
import { emailChangeSameAddress, invalidEmailChangeToken, unauthenticated } from './auth.errors.js';
import { isSessionPermitted } from './auth.service.js';
import type { EmailChangeTokenRepository } from './emailChangeToken.repository.js';
import type { PasswordResetTokenRepository } from './passwordResetToken.repository.js';

export const EMAIL_CHANGE_TOKEN_TTL_MINUTES = 30;

const DUPLICATE_KEY_CODE = 11000;

export interface EmailChangeService {
  requestChange(userId: string, newEmail: string): Promise<void>;
  confirmChange(rawToken: string): Promise<void>;
}

export interface EmailChangeDependencies {
  readonly users: UserRepository;
  readonly tokens: EmailChangeTokenRepository;
  readonly resetTokens: PasswordResetTokenRepository;
  readonly mailer: Mailer;
  readonly frontendUrl: string;
  readonly transactions: { run<T>(work: (session: DbSession) => Promise<T>): Promise<T> };
}

const isDuplicateKey = (error: unknown): boolean =>
  (error as { code?: number } | null)?.code === DUPLICATE_KEY_CODE;

export const createEmailChangeService = ({
  users,
  tokens,
  resetTokens,
  mailer,
  frontendUrl,
  transactions,
}: EmailChangeDependencies): EmailChangeService => {
  const dispatch = (message: MailMessage, kind: string): void => {
    void mailer
      .send(message)
      .then(() => logger.info(`${kind} email dispatched`, { mode: mailer.mode }))
      .catch((error: unknown) =>
        logger.error(`${kind} email failed to send`, {
          mode: mailer.mode,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
  };

  return {
    async requestChange(userId, newEmail) {
      const user = await users.findById(userId);
      if (user === null || !isSessionPermitted(user)) throw unauthenticated();
      if (user.email === newEmail) throw emailChangeSameAddress();

      const available = !(await users.existsByEmail(newEmail));
      const expiresAt = new Date(Date.now() + EMAIL_CHANGE_TOKEN_TTL_MINUTES * 60 * 1000);
      const { rawToken } = await tokens.issueFor(user._id, newEmail, expiresAt);

      if (!available) return;

      const confirmUrl = `${frontendUrl}/confirm-email-change?token=${encodeURIComponent(rawToken)}`;
      dispatch(
        buildEmailChangeVerificationEmail(newEmail, {
          confirmUrl,
          expiryMinutes: EMAIL_CHANGE_TOKEN_TTL_MINUTES,
          language: user.language,
        }),
        'Email change verification',
      );
    },

    async confirmChange(rawToken) {
      const stored = await tokens.findByHash(tokens.hash(rawToken));
      if (
        stored === null ||
        stored.usedAt !== null ||
        stored.invalidatedAt !== null ||
        stored.expiresAt.getTime() <= Date.now()
      ) {
        throw invalidEmailChangeToken();
      }

      const user = await users.findById(stored.user.toString());
      if (user === null || !isSessionPermitted(user)) throw invalidEmailChangeToken();
      if (await users.existsByEmail(stored.newEmail)) throw invalidEmailChangeToken();

      const previousEmail = user.email;

      try {
        await transactions.run(async (session) => {
          if (!(await tokens.claim(stored._id, session))) throw invalidEmailChangeToken();
          if (!(await users.updateEmail(user._id, previousEmail, stored.newEmail, session))) {
            throw invalidEmailChangeToken();
          }
          await tokens.invalidateAllFor(user._id, session);
          await resetTokens.invalidateAllFor(user._id, session);
        });
      } catch (error) {
        if (isDuplicateKey(error)) throw invalidEmailChangeToken();
        throw error;
      }

      dispatch(
        buildEmailChangedNoticeEmail(previousEmail, {
          newEmail: stored.newEmail,
          language: user.language,
        }),
        'Email change notice',
      );
    },
  };
};
