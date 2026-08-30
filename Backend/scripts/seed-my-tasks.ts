/**
 * Seeds a known set of work for one account, so My Tasks can be driven in a browser and checked by
 * hand. There is no create-task endpoint in this batch — Create task is its own approved screen —
 * so fixtures are written through the model, the same way the verification suites do it.
 *
 *   npm run seed:my-tasks -- someone@example.com [delegate@example.com]
 */
import { config as loadEnvFile } from 'dotenv';
import { Types } from 'mongoose';

import { loadConfig } from '../src/config/env.js';
import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { ProjectModel } from '../src/features/projects/project.model.js';
import { TaskModel } from '../src/features/tasks/task.model.js';
import { UserModel } from '../src/features/users/user.model.js';

const day = (offset: number): Date => new Date(Date.now() + offset * 86_400_000);

const run = async (): Promise<void> => {
  loadEnvFile({ quiet: true });
  await connectToDatabase(loadConfig().mongoUri);

  const [email, delegateEmail] = process.argv.slice(2);
  if (!email) throw new Error('Usage: npm run seed:my-tasks -- <email> [delegateEmail]');

  const user = await UserModel.findOne({ email }).lean().exec();
  if (!user) throw new Error(`No account for ${email}`);

  const delegate = delegateEmail
    ? await UserModel.findOne({ email: delegateEmail }).lean().exec()
    : null;
  if (delegateEmail && !delegate) throw new Error(`No account for ${delegateEmail}`);

  // Any project this person can already see, so the rows carry a real project name.
  const project = await ProjectModel.findOne({}).sort({ createdAt: -1 }).lean().exec();
  const projectFields = project
    ? { kind: 'project' as const, project: project._id, company: project.company }
    : { kind: 'standalone' as const };

  await TaskModel.deleteMany({ title: { $regex: '^\\[seed\\] ' } }).exec();

  const rows = [
    { ...projectFields, title: '[seed] יציקת רצפה', dueDate: day(-3), startDate: day(-10) },
    { ...projectFields, title: '[seed] התקנת מעקה', dueDate: day(4), startDate: day(-1), startedAt: day(-1) },
    {
      ...projectFields,
      title: '[seed] בדיקת אטימה',
      dueDate: day(-8),
      startDate: day(-12),
      startedAt: day(-11),
      completedAt: day(-9),
    },
    {
      kind: 'standalone' as const,
      title: '[seed] סידור המחסן',
      dueDate: day(6),
      startDate: day(0),
      createdBy: new Types.ObjectId(user._id),
    },
  ].map((row) => ({
    createdBy: project?.createdBy ?? new Types.ObjectId(user._id),
    assignee: new Types.ObjectId(user._id),
    ...row,
  }));

  if (delegate) {
    rows.push({
      ...projectFields,
      title: '[seed] מעבר צנרת — הועבר לביצוע',
      description: 'כל החשמל בקומה',
      dueDate: day(9),
      startDate: day(1),
      createdBy: project?.createdBy ?? new Types.ObjectId(user._id),
      assignee: new Types.ObjectId(user._id),
      delegation: {
        delegate: new Types.ObjectId(delegate._id),
        scope: 'part' as const,
        partDescription: 'מעבר הצנרת בלבד',
        delegatedAt: new Date(),
      },
    } as never);
  }

  for (const row of rows) await TaskModel.create(row);

  console.log(`Seeded ${rows.length} tasks for ${email}${delegate ? ` (delegate: ${delegateEmail})` : ''}.`);
  await disconnectFromDatabase();
};

void run();
