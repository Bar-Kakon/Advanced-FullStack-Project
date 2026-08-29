/** Seeds six contractors with known rating averages and prints them as one JSON line. */
import { Types } from 'mongoose';

import { CompanyModel } from '../src/features/companies/company.model.js';
import { RatingModel } from '../src/features/ratings/rating.model.js';
import { UserModel } from '../src/features/users/user.model.js';
import { cleanUp, createAccount } from './support/accounts.js';
import { finish, startHarness } from './support/harness.js';

const MARKER = 'minrating-seed';

/** Ratings outlive `cleanUp`, so a re-seed removes the previous run's before it deletes its users. */
const clearPreviousRatings = async (): Promise<void> => {
  const previous = await UserModel.find({ email: new RegExp(`^${MARKER}\\.`) }).select('_id').lean().exec();
  const ids = previous.map((user) => user._id);
  if (ids.length > 0) {
    await RatingModel.deleteMany({ $or: [{ ratee: { $in: ids } }, { rater: { $in: ids } }] }).exec();
  }
};

const SCORES: Record<string, readonly number[]> = {
  unrated: [],
  '2.5': [2, 3],
  '3.0': [3, 3],
  '3.5': [3, 4],
  '4.0': [4, 4],
  '5.0': [5, 5],
};

const run = async (): Promise<never> => {
  const harness = await startHarness();
  const { baseUrl } = harness;
  await clearPreviousRatings();
  await cleanUp(MARKER);

  const token = `Rated${Date.now()}`;
  const viewer = await createAccount(baseUrl, MARKER, 1);
  const raterOne = await createAccount(baseUrl, MARKER, 2);
  const raterTwo = await createAccount(baseUrl, MARKER, 3);

  const contractors: { label: string; userId: string; company: string; average: number | null }[] = [];
  let index = 4;

  for (const [label, scores] of Object.entries(SCORES)) {
    const account = await createAccount(baseUrl, MARKER, index);
    index += 1;

    const company = `${token} ${label} Ltd`;
    await CompanyModel.updateOne({ _id: account.companyId }, { $set: { name: company } }).exec();

    for (const [position, score] of scores.entries()) {
      await RatingModel.create({
        rater: position === 0 ? raterOne.userId : raterTwo.userId,
        ratee: account.userId,
        score,
        task: new Types.ObjectId(),
      });
    }

    contractors.push({
      label,
      userId: account.userId.toString(),
      company,
      average: scores.length === 0 ? null : scores.reduce((a, b) => a + b, 0) / scores.length,
    });
  }

  console.log(`SEED ${JSON.stringify({ token, viewer: viewer.email, contractors })}`);
  return finish(harness);
};

run().catch((error: unknown) => {
  console.error(error);
  process.exit(2);
});