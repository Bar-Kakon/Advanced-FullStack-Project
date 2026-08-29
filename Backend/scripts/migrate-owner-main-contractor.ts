/**
 * Backfills `companyPosition: main_contractor` onto owner memberships created before registration
 * recorded it.
 *
 * Scope is deliberately narrow: `standing: 'owner'` rows that carry no position at all. A row that
 * already names a position is never rewritten, and no other standing is touched. Run once per
 * environment: `npm run migrate:owner-main-contractor`. Pass `--dry-run` to report only.
 */
import { config as loadEnvFile } from 'dotenv';

import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { loadConfig } from '../src/config/env.js';
import {
  countOwnersWithOtherPosition,
  countOwnersWithoutPosition,
  migrateOwnerPositions,
} from './support/ownerPositionBackfill.js';

const run = async (): Promise<void> => {
  loadEnvFile({ quiet: true });
  await connectToDatabase(loadConfig().mongoUri);

  const dryRun = process.argv.includes('--dry-run');

  console.log(`\n  owner rows with no position:            ${await countOwnersWithoutPosition()}`);
  console.log(`  owner rows already naming another job:  ${await countOwnersWithOtherPosition()}  (left untouched)`);

  if (dryRun) {
    console.log('\n  --dry-run: nothing was written.\n');
    await disconnectFromDatabase();
    return;
  }

  const moved = await migrateOwnerPositions();
  console.log(`\n  rows updated:                           ${moved}`);
  console.log(`  owner rows still without a position:    ${await countOwnersWithoutPosition()}\n`);

  await disconnectFromDatabase();
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
