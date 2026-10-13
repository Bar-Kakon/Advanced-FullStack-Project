import { logger } from '../../shared/logger.js';
import type {
  CancellationSweepResult,
  ProjectCancellationService,
} from './projectCancellation.service.js';

/** Five minutes: an interruption is rare, and the stamp keeps the project safe meanwhile. */
export const CANCELLATION_SWEEP_INTERVAL_MS = 5 * 60_000;

export interface ProjectCancellationWorker {
  runOnce(): Promise<CancellationSweepResult>;
  start(): void;
  stop(): void;
}

/**
 * Durable by construction: the stamp lives on the row, so a restart only delays the sweep — the
 * boot run resolves whatever a crash left behind, and nobody has to notice and retry by hand.
 */
export const createProjectCancellationWorker = (
  service: ProjectCancellationService,
  intervalMs: number = CANCELLATION_SWEEP_INTERVAL_MS,
): ProjectCancellationWorker => {
  let timer: NodeJS.Timeout | null = null;
  let sweeping = false;

  const runOnce = async (): Promise<CancellationSweepResult> => service.resumeInterrupted();

  const tick = (): void => {
    if (sweeping) return;
    sweeping = true;

    runOnce()
      .then((result) => {
        if (result.resumed > 0 || result.released > 0) {
          logger.info('Interrupted project cancellations settled', {
            resumed: result.resumed,
            released: result.released,
          });
        }
      })
      .catch((error: unknown) => {
        logger.error('Project cancellation sweep failed', {
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
