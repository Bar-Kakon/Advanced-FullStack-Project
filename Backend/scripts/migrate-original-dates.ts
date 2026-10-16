/**
 * One-time backfill of original and baseline dates on tasks created before the fields existed,
 * per the owner's correction of 2026-10-16.
 *
 * Agreement-born work recovers its ORIGINAL dates from the accepted agreement message — the
 * authoritative record of what the two parties agreed — and is marked `agreement`. Every other
 * legacy STANDALONE task takes its current persisted dates as a MIGRATION BASELINE, marked
 * `migration_baseline`, which is never presented as a verified historical agreement. A legacy
 * project task is reported and left unknown — its dates answer to the proposal flow, not to this
 * mechanism.
 *
 *   npm run migrate:original-dates
 */
import { config as loadEnvFile } from 'dotenv';
import { Types } from 'mongoose';

import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { loadConfig } from '../src/config/env.js';
import { MessageModel } from '../src/features/messaging/message.model.js';
import { TaskModel } from '../src/features/tasks/task.model.js';

const asDate = (calendar: string): Date => new Date(`${calendar}T00:00:00.000Z`);

export interface BackfillReport {
  readonly missing: number;
  readonly fromAgreement: number;
  readonly baselined: number;
  readonly leftUnknown: number;
  readonly sourceStamped: number;
}

export const backfillOriginalDates = async (): Promise<BackfillReport> => {
  // A row the creation path already stamped carries genuine creation dates; only the marker is new.
  const stamped = await TaskModel.updateMany(
    { originalStartDate: { $exists: true }, originalDatesSource: { $exists: false } },
    { $set: { originalDatesSource: 'creation' } },
  ).exec();

  const missing = await TaskModel.find({ originalStartDate: { $exists: false } })
    .select('_id kind startDate dueDate')
    .lean<{ _id: Types.ObjectId; kind: string; startDate: Date; dueDate: Date }[]>()
    .exec();

  const agreements = await MessageModel.find({
    kind: 'agreement',
    'agreement.state': 'accepted',
    'agreement.task': { $in: missing.map((row) => row._id) },
  })
    .select('agreement.task agreement.startDate agreement.dueDate')
    .lean<{ agreement: { task: Types.ObjectId; startDate: string; dueDate: string } }[]>()
    .exec();

  let fromAgreement = 0;
  const recovered = new Set<string>();
  for (const row of agreements) {
    await TaskModel.updateOne(
      { _id: row.agreement.task, originalStartDate: { $exists: false } },
      {
        $set: {
          originalStartDate: asDate(row.agreement.startDate),
          originalDueDate: asDate(row.agreement.dueDate),
          originalDatesSource: 'agreement',
        },
      },
    ).exec();
    recovered.add(row.agreement.task.toString());
    fromAgreement += 1;
  }

  let baselined = 0;
  let leftUnknown = 0;
  for (const row of missing) {
    if (recovered.has(row._id.toString())) continue;
    if (row.kind !== 'standalone') {
      leftUnknown += 1;
      continue;
    }
    await TaskModel.updateOne(
      { _id: row._id, originalStartDate: { $exists: false } },
      {
        $set: {
          originalStartDate: row.startDate,
          originalDueDate: row.dueDate,
          originalDatesSource: 'migration_baseline',
        },
      },
    ).exec();
    baselined += 1;
  }

  return {
    missing: missing.length,
    fromAgreement,
    baselined,
    leftUnknown,
    sourceStamped: stamped.modifiedCount,
  };
};

const run = async (): Promise<void> => {
  loadEnvFile({ quiet: true });
  await connectToDatabase(loadConfig().mongoUri);

  const report = await backfillOriginalDates();
  console.log(`tasks without originals: ${report.missing}`);
  console.log(`originals recovered from accepted agreements: ${report.fromAgreement}`);
  console.log(`standalone baselines set from current dates: ${report.baselined}`);
  console.log(`left unknown (project work, no evidence): ${report.leftUnknown}`);
  console.log(`creation stamps marked on already-filled rows: ${report.sourceStamped}`);

  await disconnectFromDatabase();
};

if (process.argv[1]?.endsWith('migrate-original-dates.ts')) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
