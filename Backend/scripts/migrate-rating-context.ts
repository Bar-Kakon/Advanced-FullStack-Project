/**
 * Moves rating documents from the flat `task` reference onto the work `context`, and retires the
 * index that keyed on it.
 *
 * A row whose task still resolves to a project task is migrated. A row whose task does not resolve
 * cannot be given a project, so it is removed: every such row in this repository was written by a
 * seed or verification script against a fabricated ObjectId, and keeping a shapeless document would
 * leave it counting toward a contractor's average with no work behind it.
 *
 *   npm run migrate:rating-context
 */
import { config as loadEnvFile } from 'dotenv';
import { Types } from 'mongoose';

import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { loadConfig } from '../src/config/env.js';
import { RatingModel } from '../src/features/ratings/rating.model.js';
import { TaskModel } from '../src/features/tasks/task.model.js';

const OLD_INDEX = 'rating_rater_ratee_task_unique';

interface LegacyRating {
  readonly _id: Types.ObjectId;
  readonly task?: Types.ObjectId;
  readonly context?: unknown;
}

const run = async (): Promise<void> => {
  loadEnvFile({ quiet: true });
  await connectToDatabase(loadConfig().mongoUri);

  const legacy = await RatingModel.find({ context: { $exists: false } })
    .select('task')
    .lean<LegacyRating[]>()
    .exec();

  console.log(`rating documents with no context: ${legacy.length}`);

  let migrated = 0;
  let removed = 0;

  for (const row of legacy) {
    const task = row.task
      ? await TaskModel.findById(row.task).select('project').lean<{ project?: Types.ObjectId }>().exec()
      : null;

    if (task?.project) {
      await RatingModel.updateOne(
        { _id: row._id },
        {
          $set: { context: { kind: 'project_task', project: task.project, task: row.task } },
          $unset: { task: '' },
        },
      ).exec();
      migrated += 1;
      continue;
    }

    await RatingModel.deleteOne({ _id: row._id }).exec();
    removed += 1;
  }

  const indexes = await RatingModel.collection.indexes();
  if (indexes.some((index) => index.name === OLD_INDEX)) {
    await RatingModel.collection.dropIndex(OLD_INDEX);
    console.log(`dropped ${OLD_INDEX}`);
  }
  await RatingModel.syncIndexes();

  console.log(`migrated: ${migrated}`);
  console.log(`removed (task did not resolve): ${removed}`);
  console.log(`remaining without context: ${await RatingModel.countDocuments({ context: { $exists: false } })}`);

  await disconnectFromDatabase();
};

void run();
