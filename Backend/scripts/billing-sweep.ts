/**
 * Applies every subscription period that has run out.
 *
 * A scheduled downgrade or cancellation takes effect here, at the end of the period that was paid
 * for. An unscheduled lapse becomes `past_due` and drops to Free, because a tier nobody has paid
 * for must not keep being served.
 *
 * DEPLOYMENT REQUIREMENT: this has to be scheduled — nightly is enough, since every boundary is a
 * period end. Nothing else moves a lapsed period, so until it runs a person keeps the tier whose
 * period has ended. It is idempotent and safe to run as often as wanted.
 */
import { config as loadEnvFile } from 'dotenv';

import { loadConfig } from '../src/config/env.js';
import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { createBillingModule } from '../src/features/billing/billing.module.js';

loadEnvFile({ quiet: true });

const SWEEP_LIMIT = 500;

const run = async (): Promise<void> => {
  const config = loadConfig();
  await connectToDatabase(config.mongoUri);

  // The module is built for its wiring; the sweep needs no HTTP surface, so the router is unused.
  const { subscriptions } = createBillingModule(config, (_req, _res, next) => next(), config.apiPublicUrl);
  const applied = await subscriptions.reconcileLapsed(new Date(), SWEEP_LIMIT);

  console.log(`Reconciled ${applied} lapsed subscription period(s).`);
  await disconnectFromDatabase();
};

run().catch(async (error: unknown) => {
  console.error(error);
  await disconnectFromDatabase();
  process.exit(1);
});
