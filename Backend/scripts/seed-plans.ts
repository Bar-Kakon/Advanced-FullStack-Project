/**
 * Seeds the three subscription tiers.
 *
 * Idempotent, and it never overwrites. Every limit and price is provisional and is meant to be a
 * data edit rather than a deploy, so a value changed in the database survives running this again.
 */
import { config as loadEnvFile } from 'dotenv';

import { loadConfig } from '../src/config/env.js';
import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { planRepository } from '../src/features/billing/plan.repository.js';

loadEnvFile({ quiet: true });

const run = async (): Promise<void> => {
  const config = loadConfig();
  await connectToDatabase(config.mongoUri);

  const inserted = await planRepository.seedMissing();
  const plans = await planRepository.findActive();

  console.log(`Inserted ${inserted} plan(s). The catalogue now holds ${plans.length}:`);
  for (const plan of plans) {
    const ils = plan.prices.find((price) => price.currency === 'ILS');
    console.log(
      `  ${plan.code.padEnd(8)} ₪${((ils?.amountMinor ?? 0) / 100).toFixed(2)}/month  ` +
        `projects=${plan.limits.activeProjects ?? '∞'} ` +
        `delegations=${plan.limits.activeDelegations ?? '∞'} ` +
        `connections=${plan.limits.connections ?? '∞'}` +
        `${plan.provisional ? '  (provisional)' : ''}`,
    );
  }

  await disconnectFromDatabase();
};

run().catch(async (error: unknown) => {
  console.error(error);
  await disconnectFromDatabase();
  process.exit(1);
});
