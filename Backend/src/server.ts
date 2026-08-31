import type { Server } from 'node:http';

import { config as loadEnvFile } from 'dotenv';

import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { connectToDatabase, disconnectFromDatabase } from './db/mongoose.js';
import { buildCoordinationService } from './features/coordination/coordination.module.js';
import { createTransferWorker } from './features/coordination/responsibilityTransfer.worker.js';
import { buildEntitlementService } from './features/billing/billing.module.js';
import { createDigestWorker } from './features/notifications/digest.worker.js';
import { notificationRepository } from './features/notifications/notification.repository.js';
import { createNotificationEmailWorker } from './features/notifications/notificationEmail.worker.js';
import { queuedEmailRepository } from './features/notifications/queuedEmail.repository.js';
import { recipientRepository } from './features/notifications/recipient.repository.js';
import { createMailer } from './mail/mailer.js';
import { logger } from './shared/logger.js';

const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const closeHttpServer = async (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

/** Anything that ticks on a timer and has to be stopped before the process may exit. */
interface BackgroundWorker {
  start(): void;
  stop(): void;
}

const shutdown = async (
  server: Server,
  workers: readonly BackgroundWorker[],
  signal: string,
): Promise<void> => {
  logger.info('Shutting down', { signal });
  for (const worker of workers) worker.stop();
  await closeHttpServer(server);
  await disconnectFromDatabase();
  logger.info('Shutdown complete');
};

const registerShutdownHandlers = (
  server: Server,
  workers: readonly BackgroundWorker[],
): void => {
  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => {
      shutdown(server, workers, signal).catch((error: unknown) => {
        logger.error('Shutdown failed', { error: describe(error) });
        process.exit(1);
      });
    });
  }
};

const startServer = async (): Promise<void> => {
  loadEnvFile({ quiet: true });

  const config = loadConfig();
  await connectToDatabase(config.mongoUri);

  const server = createApp(config).listen(config.port, () => {
    logger.info('API server listening', { port: config.port, nodeEnv: config.nodeEnv });
  });

  const mailer = createMailer(config.mail);
  const entitlements = buildEntitlementService();

  const workers: BackgroundWorker[] = [
    createTransferWorker(buildCoordinationService()),
    // The 90-minute grace is what this sweep exists for: it sends only what nobody has read yet,
    // and re-checks the seen mark, the opt-in and the plan at send time rather than at queue time.
    createNotificationEmailWorker({
      emails: queuedEmailRepository,
      notifications: notificationRepository,
      recipients: recipientRepository,
      entitlements,
      mailer,
      frontendUrl: config.frontendUrl,
    }),
    createDigestWorker({
      notifications: notificationRepository,
      recipients: recipientRepository,
      entitlements,
      mailer,
      frontendUrl: config.frontendUrl,
    }),
  ];
  for (const worker of workers) worker.start();

  registerShutdownHandlers(server, workers);
};

startServer().catch((error: unknown) => {
  logger.error('Server failed to start', { error: describe(error) });
  process.exit(1);
});
