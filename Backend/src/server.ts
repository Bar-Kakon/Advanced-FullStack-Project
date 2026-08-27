import type { Server } from 'node:http';

import { config as loadEnvFile } from 'dotenv';

import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { connectToDatabase, disconnectFromDatabase } from './db/mongoose.js';
import { logger } from './shared/logger.js';

const SHUTDOWN_SIGNALS = ['SIGINT', 'SIGTERM'] as const;

const describe = (error: unknown): string => (error instanceof Error ? error.message : String(error));

const closeHttpServer = async (server: Server): Promise<void> =>
  new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });

const shutdown = async (server: Server, signal: string): Promise<void> => {
  logger.info('Shutting down', { signal });
  await closeHttpServer(server);
  await disconnectFromDatabase();
  logger.info('Shutdown complete');
};

const registerShutdownHandlers = (server: Server): void => {
  for (const signal of SHUTDOWN_SIGNALS) {
    process.once(signal, () => {
      shutdown(server, signal).catch((error: unknown) => {
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

  registerShutdownHandlers(server);
};

startServer().catch((error: unknown) => {
  logger.error('Server failed to start', { error: describe(error) });
  process.exit(1);
});
