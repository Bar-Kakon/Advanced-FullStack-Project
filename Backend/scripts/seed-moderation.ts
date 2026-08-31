/**
 * Seeds three accounts for the moderation browser run: a reporter, a subject to report, and a
 * platform moderator. Prints one `SEED {...}` line the browser script parses.
 *
 *   npm run seed:moderation
 */
import { config as loadEnvFile } from 'dotenv';

import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { loadConfig } from '../src/config/env.js';
import { ReportModel } from '../src/features/reports/report.model.js';
import { UserModel } from '../src/features/users/user.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { startHarness } from './support/harness.js';

const MARKER = 'seed-moderation';

const run = async (): Promise<void> => {
  loadEnvFile({ quiet: true });
  await connectToDatabase(loadConfig().mongoUri);
  await cleanUp(MARKER);
  await ReportModel.syncIndexes();
  await disconnectFromDatabase();

  const harness = await startHarness();
  const reporter = await createAccount(harness.baseUrl, MARKER, 1);
  const subject = await createAccount(harness.baseUrl, MARKER, 2);
  const moderator = await createAccount(harness.baseUrl, MARKER, 3);

  await UserModel.updateOne({ _id: moderator.userId }, { $set: { isAdmin: true } }).exec();
  await ReportModel.deleteMany({
    reporter: { $in: [reporter.userId, subject.userId, moderator.userId] },
  }).exec();

  // The browse search box matches on the company name, which is what scopes the run.
  const company = await UserModel.db
    .collection('companies')
    .findOne({ _id: subject.companyId });

  console.log(
    `SEED ${JSON.stringify({
      reporter: reporter.email,
      subject: subject.email,
      subjectUserId: subject.userId.toString(),
      moderator: moderator.email,
      searchTerm: (company?.['name'] as string | undefined) ?? MARKER,
    })}`,
  );

  await harness.stop();
};

run().catch(async (error: unknown) => {
  console.error(error);
  await disconnectFromDatabase().catch(() => undefined);
  process.exit(1);
});