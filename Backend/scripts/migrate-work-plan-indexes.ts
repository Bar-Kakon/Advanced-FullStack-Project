/**
 * Brings the `fileassets` indexes in line with the versioned work-plan schema.
 *
 * The two-key `{ scope.type, scope.id }` index is replaced by the three-key one that includes
 * `isCurrent`, and the partial unique `{ versionGroup, version }` index is added. Mongoose creates
 * new indexes on its own but never drops a retired one, and a stale index has already cost this
 * project once — `rating_rater_ratee_task_unique` outlived its schema and collapsed real rows.
 *
 *   npm run migrate:work-plan-indexes
 */
import { config as loadEnvFile } from 'dotenv';

import { loadConfig } from '../src/config/env.js';
import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { FileAssetModel } from '../src/features/files/fileAsset.model.js';

const run = async (): Promise<void> => {
  loadEnvFile({ quiet: true });
  await connectToDatabase(loadConfig().mongoUri);

  const before = await FileAssetModel.collection.indexes();
  console.log('\nBefore:');
  for (const index of before) console.log(`  ${index.name}  ${JSON.stringify(index.key)}`);

  const dropped = await FileAssetModel.syncIndexes();
  console.log(`\nDropped: ${dropped.length === 0 ? '(none)' : dropped.join(', ')}`);

  const after = await FileAssetModel.collection.indexes();
  console.log('\nAfter:');
  for (const index of after) console.log(`  ${index.name}  ${JSON.stringify(index.key)}`);

  await disconnectFromDatabase();
  console.log('\nDone.\n');
};

run().catch(async (error: unknown) => {
  console.error(error);
  await disconnectFromDatabase().catch(() => undefined);
  process.exit(1);
});
