import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';

import { createCorsOptions } from './config/cors.js';
import type { AppConfig } from './config/env.js';
import { errorHandler } from './middleware/errorHandler.js';
import { notFoundHandler } from './middleware/notFoundHandler.js';
import { createApiRouter } from './routes/index.js';

const JSON_BODY_LIMIT = '100kb';

/** Builds the fully wired Express application. It never listens — that is `server.ts`'s job. */
export const createApp = (config: AppConfig): Express => {
  const app = express();

  // Heroku puts exactly one proxy in front of the dyno, so `req.ip` is the last X-Forwarded-For
  // hop. Without this every caller shares one rate-limit key; trusting it anywhere else would let
  // a client forge the header and claim a fresh quota per request.
  app.set('trust proxy', config.nodeEnv === 'production' ? 1 : false);

  app.use(helmet());
  app.use(cors(createCorsOptions(config.corsOrigins)));
  app.use(express.json({ limit: JSON_BODY_LIMIT }));
  app.use(cookieParser());

  app.use('/api', createApiRouter(config));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};
