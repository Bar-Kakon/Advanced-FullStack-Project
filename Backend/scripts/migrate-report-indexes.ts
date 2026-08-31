/**
 * Builds the `reports` indexes, including the partial unique index that is the duplicate rule.
 *
 * It matters that this runs before the collection takes traffic: the rule "one open report per
 * reporter, subject and reason" is enforced by that index and by nothing else, so until it exists
 * duplicates are accepted silently.
 *
 *   npm run migrate:report-indexes
 */
import { config as loadEnvFile } from 'dotenv';

import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { loadConfig } from '../src/config/env.js';
import { ReportModel } from '../src/features/reports/report.model.js';

const run = async (): Promise<void> => {
  loadEnvFile({ quiet: true });
  await connectToDatabase(loadConfig().mongoUri);

  const dropped = await ReportModel.syncIndexes();
  const indexes = await ReportModel.collection.indexes();

  console.log(`Dropped: ${dropped.length === 0 ? 'nothing' : dropped.join(', ')}`);
  for (const index of indexes) console.log(`  ${index.name ?? '(unnamed)'}`);

  await disconnectFromDatabase();
};

run().catch(async (error: unknown) => {
  console.error(error);
  await disconnectFromDatabase().catch(() => undefined);
  process.exit(1);
});
