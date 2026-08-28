import mongoose, { type ClientSession } from 'mongoose';

import { logger } from '../shared/logger.js';

/**
 * A unit of work that several writes share. Named here rather than passing the driver's type
 * around, so a repository takes "a session" without importing the database library.
 */
export type DbSession = ClientSession;

/** Keeps an unreachable cluster from stalling startup for the driver's 30s default. */
const SERVER_SELECTION_TIMEOUT_MS = 10_000;

export type DatabaseStatus = 'connected' | 'connecting' | 'disconnecting' | 'disconnected';

const STATUS_BY_READY_STATE: Record<number, DatabaseStatus> = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

export const connectToDatabase = async (uri: string): Promise<void> => {
  mongoose.connection.on('error', (error: Error) => {
    logger.error('Database connection error', { error: error.message });
  });
  mongoose.connection.on('disconnected', () => {
    logger.warn('Database disconnected');
  });
  mongoose.connection.on('reconnected', () => {
    logger.info('Database reconnected');
  });

  await mongoose.connect(uri, { serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS });
  logger.info('Database connected', { database: mongoose.connection.name });
};

export const disconnectFromDatabase = async (): Promise<void> => {
  await mongoose.disconnect();
};

export const getDatabaseStatus = (): DatabaseStatus =>
  STATUS_BY_READY_STATE[mongoose.connection.readyState] ?? 'disconnected';

/**
 * Runs `work` so that every write inside it commits together or none of them does. Any throw —
 * including a unique-index violation raised by the driver — aborts the whole set.
 *
 * It lives beside the connection because that is what already owns the database library here;
 * a caller receives the session as an argument and never reaches for mongoose itself.
 *
 * Requires a replica set. A standalone `mongod` rejects the session, which is a configuration
 * failure rather than something to fall back from — a partial account is not a lesser success.
 */
export const runInTransaction = async <T>(
  work: (session: DbSession) => Promise<T>,
): Promise<T> => {
  const session = await mongoose.startSession();

  try {
    return await session.withTransaction(() => work(session));
  } finally {
    await session.endSession();
  }
};
