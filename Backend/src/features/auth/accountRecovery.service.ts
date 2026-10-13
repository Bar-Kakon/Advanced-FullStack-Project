import type { DbSession } from '../../db/mongoose.js';
import { buildAccountRecoveryEmail } from '../../mail/accountRecoveryEmail.js';
import type { Mailer } from '../../mail/mailer.js';
import { logger } from '../../shared/logger.js';
import type { PlatformAuditService } from '../moderation/platformAudit.service.js';
import { accountRestoreExpired, recoveryWindowFloor } from '../users/accountLifecycle.service.js';
import type { UserLanguage } from '../users/user.model.js';
import type { UserRepository } from '../users/user.repository.js';
import { invalidRecoveryToken } from './auth.errors.js';
import type { AccountRecoveryTokenRepository } from './accountRecoveryToken.repository.js';

/** Longer than a reset link on purpose: a deleted account's owner checks email at their own pace. */
export const RECOVERY_TOKEN_TTL_MINUTES = 60;

export interface RecoverAccountInput {
  readonly email: string;
}

export interface RestoreAccountInput {
  readonly token: string;
}

export interface AccountRecoveryService {
  requestRecovery(input: RecoverAccountInput): Promise<void>;
  restoreAccount(input: RestoreAccountInput): Promise<void>;
}

export interface AccountRecoveryDependencies {
  readonly users: UserRepository;
  readonly recoveryTokens: AccountRecoveryTokenRepository;
  readonly audit: PlatformAuditService;
  readonly mailer: Mailer;
  readonly frontendUrl: string;
  readonly transactions: { run<T>(work: (session: DbSession) => Promise<T>): Promise<T> };
}

const buildRestoreUrl = (frontendUrl: string, rawToken: string): string =>
  `${frontendUrl}/restore-account?token=${encodeURIComponent(rawToken)}`;

/**
 * Self-service D8 recovery. The request half answers identically for every input, so nothing here
 * can confirm whether an address belongs to an active, deleted, anonymized or absent account; only
 * the mailbox that already owned the account learns anything. The confirm half re-proves the whole
 * eligibility — still deleted, not anonymized, inside the window — and the restore update's own
 * filter proves it a third time, so no route can carry an account past the deadline.
 */
export const createAccountRecoveryService = ({
  users,
  recoveryTokens,
  audit,
  mailer,
  frontendUrl,
  transactions,
}: AccountRecoveryDependencies): AccountRecoveryService => {
  const dispatch = (to: string, rawToken: string, language: UserLanguage): void => {
    const restoreUrl = buildRestoreUrl(frontendUrl, rawToken);
    const message = buildAccountRecoveryEmail(to, {
      restoreUrl,
      expiryMinutes: RECOVERY_TOKEN_TTL_MINUTES,
      language,
    });

    // Only when no SMTP is configured, and only because there is then no mailbox to read the link
    // from. A configured server never writes a token to its log.
    if (mailer.mode === 'log') logger.warn('Account recovery link (log mode only)', { restoreUrl });

    void mailer
      .send(message)
      .then(() => logger.info('Account recovery email dispatched', { mode: mailer.mode }))
      .catch((error: unknown) =>
        logger.error('Account recovery email failed to send', {
          mode: mailer.mode,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
  };

  return {
    async requestRecovery({ email }) {
      const user = await users.findByEmail(email);
      const eligible =
        user !== null &&
        user.status === 'deleted' &&
        user.anonymizedAt === undefined &&
        user.deletedAt !== undefined &&
        user.deletedAt.getTime() >= recoveryWindowFloor().getTime();
      if (!eligible) return;

      const expiresAt = new Date(Date.now() + RECOVERY_TOKEN_TTL_MINUTES * 60 * 1000);
      const { rawToken } = await recoveryTokens.issueFor(user._id, expiresAt);

      dispatch(user.email, rawToken, user.language);
    },

    async restoreAccount({ token }) {
      const stored = await recoveryTokens.findByHash(recoveryTokens.hash(token));

      if (
        stored === null ||
        stored.usedAt !== null ||
        stored.invalidatedAt !== null ||
        stored.expiresAt.getTime() <= Date.now()
      ) {
        throw invalidRecoveryToken();
      }

      const life = await users.findLifecycleState(stored.user.toString());
      if (life === null || life.status !== 'deleted') throw invalidRecoveryToken();
      if (
        life.anonymizedAt !== undefined ||
        life.deletedAt === undefined ||
        life.deletedAt.getTime() < recoveryWindowFloor().getTime()
      ) {
        throw accountRestoreExpired();
      }

      await transactions.run(async (session) => {
        await recoveryTokens.markUsed(stored._id, session);
        if (!(await users.restoreWithinWindow(stored.user, recoveryWindowFloor(), session))) {
          throw accountRestoreExpired();
        }
      });

      await audit.record({
        actorId: stored.user.toString(),
        action: 'account.restored',
        targetType: 'user',
        targetId: stored.user.toString(),
        metadata: { selfService: true },
      });
    },
  };
};
