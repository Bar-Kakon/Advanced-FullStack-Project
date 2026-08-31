import { logger } from '../../shared/logger.js';
import type { CoordinationService, TransferSweepResult } from './coordination.service.js';

export const TRANSFER_SWEEP_INTERVAL_MS = 60_000;

export interface TransferWorker {
  runOnce(): Promise<TransferSweepResult>;
  start(): void;
  stop(): void;
}

export const createTransferWorker = (
  service: CoordinationService,
  intervalMs: number = TRANSFER_SWEEP_INTERVAL_MS,
): TransferWorker => {
  let timer: NodeJS.Timeout | null = null;
  let sweeping = false;

  const runOnce = async (): Promise<TransferSweepResult> => service.settleAwaitingTransfers();

  const tick = (): void => {
    if (sweeping) return;
    sweeping = true;

    runOnce()
      .then((result) => {
        if (result.completed > 0 || result.declined > 0) {
          logger.info('Responsibility transfers settled', {
            completed: result.completed,
            declined: result.declined,
          });
        }
      })
      .catch((error: unknown) => {
        logger.error('Responsibility transfer sweep failed', {
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
