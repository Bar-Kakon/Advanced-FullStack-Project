import { buildNotificationEmail } from '../../mail/notificationEmail.js';
import type { Mailer } from '../../mail/mailer.js';
import { logger } from '../../shared/logger.js';
import type { EntitlementService } from '../billing/entitlements.service.js';
import type { NotificationRepository } from './notification.repository.js';
import type { QueuedEmailRepository } from './queuedEmail.repository.js';
import type { RecipientRepository } from './recipient.repository.js';

export const EMAIL_SWEEP_INTERVAL_MS = 60_000;
const BATCH = 50;

export interface EmailSweepResult {
  readonly sent: number;
  readonly cancelled: number;
  readonly failed: number;
}

export interface NotificationEmailWorker {
  runOnce(now?: Date): Promise<EmailSweepResult>;
  start(): void;
  stop(): void;
}

export interface NotificationEmailWorkerDependencies {
  readonly emails: QueuedEmailRepository;
  readonly notifications: NotificationRepository;
  readonly recipients: RecipientRepository;
  readonly entitlements: EntitlementService;
  readonly mailer: Mailer;
  readonly frontendUrl: string;
}

/** Where an email lands the reader. Always a screen — an email never carries the action itself. */
export const destinationFor = (
  frontendUrl: string,
  row: { proposal?: unknown; task?: unknown; scheduleException?: unknown; project?: unknown },
): string => {
  if (row.proposal !== undefined) return `${frontendUrl}/proposals/${String(row.proposal)}`;
  if (row.task !== undefined) return `${frontendUrl}/tasks/${String(row.task)}`;
  if (row.scheduleException !== undefined && row.project !== undefined) {
    return `${frontendUrl}/projects/${String(row.project)}/schedule-exceptions`;
  }
  if (row.project !== undefined) return `${frontendUrl}/projects/${String(row.project)}`;
  return `${frontendUrl}/notifications`;
};

/**
 * Sends the blocking emails whose 90-minute grace has run out.
 *
 * Every row is re-checked at send time rather than trusted from when it was queued: the direct
 * cancellation on `markSeen` is the primary path, and this second look is what makes a
 * cancellation that raced the sweep still hold. The opt-in and the plan are re-read for the same
 * reason — somebody who withdrew consent inside the window is not emailed.
 */
export const createNotificationEmailWorker = ({
  emails,
  notifications,
  recipients,
  entitlements,
  mailer,
  frontendUrl,
}: NotificationEmailWorkerDependencies, intervalMs: number = EMAIL_SWEEP_INTERVAL_MS): NotificationEmailWorker => {
  let timer: NodeJS.Timeout | null = null;
  let sweeping = false;

  const runOnce = async (now: Date = new Date()): Promise<EmailSweepResult> => {
    const due = await emails.due(now, BATCH);
    let sent = 0;
    let cancelled = 0;
    let failed = 0;

    for (const queued of due) {
      const notification = await notifications.findById(queued.notification.toString());

      if (notification === null || notification.seenAt !== undefined) {
        await emails.cancelFor([queued.notification], 'seen');
        cancelled += 1;
        continue;
      }

      const target = await recipients.findDeliveryTarget(queued.user);
      if (target === null || !target.operationalEmail) {
        await emails.cancelFor([queued.notification], 'opted_out');
        cancelled += 1;
        continue;
      }

      if (!(await entitlements.mayUse(queued.user.toString(), 'emailNotifications'))) {
        await emails.cancelFor([queued.notification], 'not_entitled');
        cancelled += 1;
        continue;
      }

      try {
        await mailer.send(
          buildNotificationEmail(target.email, {
            type: notification.type,
            payload: notification.payload,
            language: target.language,
            url: destinationFor(frontendUrl, notification),
          }),
        );
        await emails.markSent(queued._id);
        sent += 1;
      } catch (error) {
        await emails.markFailed(queued._id);
        failed += 1;
        logger.error('Notification email failed', {
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return { sent, cancelled, failed };
  };

  const tick = (): void => {
    if (sweeping) return;
    sweeping = true;

    runOnce()
      .then((result) => {
        if (result.sent > 0 || result.failed > 0) {
          logger.info('Notification emails swept', {
            sent: result.sent,
            cancelled: result.cancelled,
            failed: result.failed,
          });
        }
      })
      .catch((error: unknown) => {
        logger.error('Notification email sweep failed', {
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
