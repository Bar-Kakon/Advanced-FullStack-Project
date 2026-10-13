import { logger } from '../../shared/logger.js';
import type {
  AccountAnonymizationService,
  AnonymizationSweepResult,
} from './accountAnonymization.service.js';

/** Hourly: the deadline is measured in days, so nothing is waiting on a tighter clock. */
export const ANONYMIZATION_SWEEP_INTERVAL_MS = 60 * 60_000;

export interface AccountAnonymizationWorker {
  runOnce(): Promise<AnonymizationSweepResult>;
  start(): void;
  stop(): void;
}

/**
 * Durable by construction, not by uptime: eligibility lives in `deletedAt`, so a restart, a
 * redeploy or a long sleep only delays the sweep — the next tick processes whatever is due.
 */
export const createAccountAnonymizationWorker = (
  service: AccountAnonymizationService,
  intervalMs: number = ANONYMIZATION_SWEEP_INTERVAL_MS,
): AccountAnonymizationWorker => {
  let timer: NodeJS.Timeout | null = null;
  let sweeping = false;

  const runOnce = async (): Promise<AnonymizationSweepResult> => service.sweep();

  const tick = (): void => {
    if (sweeping) return;
    sweeping = true;

    runOnce()
      .then((result) => {
        if (result.anonymized > 0) {
          logger.info('Accounts anonymized past the recovery window', {
            anonymized: result.anonymized,
          });
        }
      })
      .catch((error: unknown) => {
        logger.error('Account anonymization sweep failed', {
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
