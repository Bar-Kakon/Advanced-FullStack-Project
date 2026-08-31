import { Types } from 'mongoose';

import { buildDigestEmail } from '../../mail/notificationEmail.js';
import type { Mailer } from '../../mail/mailer.js';
import { logger } from '../../shared/logger.js';
import type { EntitlementService } from '../billing/entitlements.service.js';
import type { NotificationRepository } from './notification.repository.js';
import type { RecipientRepository } from './recipient.repository.js';

export const DIGEST_SWEEP_INTERVAL_MS = 15 * 60_000;
/** Where the digest goes out when the account has not chosen an hour. End of the working day. */
export const DEFAULT_DIGEST_HOUR = 18;
const WINDOW_HOURS = 24;

export interface DigestSweepResult {
  readonly sent: number;
  readonly skipped: number;
}

export interface DigestWorker {
  runOnce(now?: Date): Promise<DigestSweepResult>;
  start(): void;
  stop(): void;
}

export interface DigestWorkerDependencies {
  readonly notifications: NotificationRepository;
  readonly recipients: RecipientRepository;
  readonly entitlements: EntitlementService;
  readonly mailer: Mailer;
  readonly frontendUrl: string;
}

/**
 * The end-of-day aggregation of everything non-blocking.
 *
 * Three closed rules decide who gets one. It carries **only what is still relevant** — the
 * repository excludes anything already seen in-app, so nothing is resurfaced by email that evening.
 * It is **a plan entitlement**: Free is blocking coverage, and the digest starts at Basic. And a
 * **muted project contributes nothing**, because rows written while muted are excluded from the
 * candidate query rather than filtered out here.
 *
 * The hour is per account and defaults to the end of the working day; a Premium account may move
 * it, and the entitlement is re-read here so a lapsed one falls back rather than keeping a setting
 * it no longer pays for.
 */
export const createDigestWorker = (
  { notifications, recipients, entitlements, mailer, frontendUrl }: DigestWorkerDependencies,
  intervalMs: number = DIGEST_SWEEP_INTERVAL_MS,
): DigestWorker => {
  let timer: NodeJS.Timeout | null = null;
  let sweeping = false;
  /** The hour each account was last sent in, so one sweep per hour cannot send twice. */
  const lastSentHour = new Map<string, string>();

  const runOnce = async (now: Date = new Date()): Promise<DigestSweepResult> => {
    const since = new Date(now.getTime() - WINDOW_HOURS * 3_600_000);
    const candidates = await notifications.usersWithDigestCandidates(since);
    if (candidates.length === 0) return { sent: 0, skipped: 0 };

    const targets = await recipients.findDeliveryTargets(candidates);
    const hourStamp = `${now.toISOString().slice(0, 10)}T${now.getUTCHours()}`;

    let sent = 0;
    let skipped = 0;

    for (const userId of candidates) {
      const key = userId.toString();
      const target = targets.get(key);

      if (target === undefined || !target.operationalEmail) {
        skipped += 1;
        continue;
      }
      if (!(await entitlements.mayUse(key, 'notificationDigest'))) {
        skipped += 1;
        continue;
      }

      const mayControlTiming = await entitlements.mayUse(key, 'notificationTimingControls');
      const hour =
        mayControlTiming && target.digestHour !== null ? target.digestHour : DEFAULT_DIGEST_HOUR;
      if (now.getUTCHours() !== hour || lastSentHour.get(key) === hourStamp) {
        skipped += 1;
        continue;
      }

      const rows = await notifications.digestCandidates(new Types.ObjectId(key), since);
      if (rows.length === 0) {
        skipped += 1;
        continue;
      }

      try {
        await mailer.send(
          buildDigestEmail(target.email, {
            items: rows.map((row) => ({ type: row.type, payload: row.payload })),
            language: target.language,
            url: `${frontendUrl}/notifications`,
          }),
        );
        lastSentHour.set(key, hourStamp);
        sent += 1;
      } catch (error) {
        skipped += 1;
        logger.error('Digest email failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { sent, skipped };
  };

  const tick = (): void => {
    if (sweeping) return;
    sweeping = true;

    runOnce()
      .then((result) => {
        if (result.sent > 0) logger.info('Daily digests sent', { sent: result.sent });
      })
      .catch((error: unknown) => {
        logger.error('Digest sweep failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      })
      .finally(() => {
        sweeping = false;
      });
  };

  return {
    runOnce,

    start() {
      if (timer !== null) return;
      timer = setInterval(tick, intervalMs);
      timer.unref();
      tick();
    },

    stop() {
      if (timer === null) return;
      clearInterval(timer);
      timer = null;
    },
  };
};
