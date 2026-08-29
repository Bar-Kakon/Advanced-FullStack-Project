/**
 * Replaces the `user_1` index, which only made activation exclusive, with `user_current_unique`,
 * which makes a person's whole company relationship exclusive.
 *
 * Mongoose would not do this on its own: the two share a key, so `autoIndex` raises
 * IndexOptionsConflict and skips the new one — the constraint would be in the code and absent from
 * the database. Run once per environment: `npm run migrate:membership-uniqueness`.
 */
import { config as loadEnvFile } from 'dotenv';

import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { loadConfig } from '../src/config/env.js';
import {
  CompanyMembershipModel,
  CURRENT_MEMBERSHIP_STATUSES,
} from '../src/features/companies/companyMembership.model.js';

const SUPERSEDED = 'user_1';
const REPLACEMENT = 'user_current_unique';

/** Rows the new index would refuse. Reported rather than repaired: a merge is nobody's guess. */
const findViolations = async (): Promise<{ _id: unknown; count: number }[]> =>
  CompanyMembershipModel.aggregate([
    { $match: { user: { $ne: null }, status: { $in: [...CURRENT_MEMBERSHIP_STATUSES] } } },
    { $group: { _id: '$user', count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
  ]).exec();

const run = async (): Promise<void> => {
  loadEnvFile({ quiet: true });
  await connectToDatabase(loadConfig().mongoUri);

  const violations = await findViolations();
  if (violations.length > 0) {
    console.error(`\n${violations.length} user(s) already hold more than one live membership:`);
    for (const row of violations) console.error(`  user ${String(row._id)} — ${row.count} rows`);
    console.error('\nResolve those first; a unique index cannot be built over them.\n');
    await disconnectFromDatabase();
    process.exit(1);
  }

  const collection = CompanyMembershipModel.collection;
  const before = await collection.indexes();

  if (before.some((index) => index.name === SUPERSEDED)) {
    await collection.dropIndex(SUPERSEDED);
    console.log(`  dropped ${SUPERSEDED}`);
  } else {
    console.log(`  ${SUPERSEDED} is already gone`);
  }

  await CompanyMembershipModel.syncIndexes();

  const after = await collection.indexes();
  const created = after.find((index) => index.name === REPLACEMENT);
  console.log(`  ${REPLACEMENT}: ${created ? JSON.stringify(created.partialFilterExpression) : 'MISSING'}`);
  console.log(`\n  indexes now: ${after.map((index) => index.name).join(', ')}\n`);

  await disconnectFromDatabase();
  process.exit(created ? 0 : 1);
};

run().catch(async (error: unknown) => {
  console.error(error);
  await disconnectFromDatabase().catch(() => undefined);
  process.exit(2);
});
