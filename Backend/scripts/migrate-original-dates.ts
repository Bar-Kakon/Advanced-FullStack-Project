/**
 * One-time backfill of the originally agreed dates on tasks created before the fields existed.
 *
 * Agreement-born work recovers its originals from the accepted agreement message, which is the
 * authoritative record of what the two parties agreed. Every other legacy task is REPORTED AND
 * LEFT UNKNOWN — its current dates are what the task says today, never evidence of what was first
 * agreed, and inventing historical accuracy would be worse than admitting its absence.
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
  readonly recovered: number;
  readonly unknown: number;
}

export const backfillOriginalDates = async (): Promise<BackfillReport> => {
  const missing = await TaskModel.find({ originalStartDate: { $exists: false } })
    .select('_id')
    .lean<{ _id: Types.ObjectId }[]>()
    .exec();

  const agreements = await MessageModel.find({
    kind: 'agreement',
    'agreement.state': 'accepted',
    'agreement.task': { $in: missing.map((row) => row._id) },
  })
    .select('agreement.task agreement.startDate agreement.dueDate')
    .lean<{ agreement: { task: Types.ObjectId; startDate: string; dueDate: string } }[]>()
    .exec();

  let recovered = 0;
  for (const row of agreements) {
    await TaskModel.updateOne(
      { _id: row.agreement.task, originalStartDate: { $exists: false } },
      {
        $set: {
          originalStartDate: asDate(row.agreement.startDate),
          originalDueDate: asDate(row.agreement.dueDate),
        },
      },
    ).exec();
    recovered += 1;
  }

  return { missing: missing.length, recovered, unknown: missing.length - recovered };
};

const run = async (): Promise<void> => {
  loadEnvFile({ quiet: true });
  await connectToDatabase(loadConfig().mongoUri);

  const report = await backfillOriginalDates();
  console.log(`tasks without originals: ${report.missing}`);
  console.log(`recovered from accepted agreements: ${report.recovered}`);
  console.log(`left unknown (no authoritative evidence): ${report.unknown}`);

  await disconnectFromDatabase();
};

if (process.argv[1]?.endsWith('migrate-original-dates.ts')) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
