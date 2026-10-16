/**
 * One-time backfill of original and baseline dates on tasks created before the fields existed,
 * per the owner's correction of 2026-10-16.
 *
 * Agreement-born work recovers its ORIGINAL dates from the accepted agreement message — the
 * authoritative record of what the two parties agreed — and is marked `agreement`. Every other
 * legacy STANDALONE task takes its current persisted dates as a MIGRATION BASELINE, marked
 * `migration_baseline`, which is never presented as a verified historical agreement. A legacy
 * project task is reported and left unknown — its dates answer to the proposal flow.
 *
 * Nothing is written without `--apply`, and `--apply` refuses unless `--confirm-db` names the
 * database actually connected. Every write is recorded in a manifest of task ids, and
 * `--rollback=<manifest>` undoes exactly those writes and nothing else.
 *
 *   npm run migrate:original-dates                                   plan only, read-only
 *   npm run migrate:original-dates -- --apply --confirm-db=<db>      write, and save a manifest
 *   npm run migrate:original-dates -- --rollback=<file> --confirm-db=<db> [--apply]
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { config as loadEnvFile } from 'dotenv';
import mongoose, { Types } from 'mongoose';

import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { loadConfig } from '../src/config/env.js';
import { MessageModel } from '../src/features/messaging/message.model.js';
import { TaskModel, type OriginalDatesSource } from '../src/features/tasks/task.model.js';

const CALENDAR = /^\d{4}-\d{2}-\d{2}$/;
const asDate = (calendar: string): Date => new Date(`${calendar}T00:00:00.000Z`);

export interface OriginalDatesPlan {
  readonly totalTasks: number;
  readonly missing: number;
  readonly fromAgreement: readonly string[];
  readonly baseline: readonly string[];
  readonly projectLeftUnknown: number;
  readonly creationUnmarked: readonly string[];
  /** Tasks linked to more than one accepted agreement, or to one with unreadable dates. Skipped. */
  readonly conflicts: readonly { readonly task: string; readonly reason: string }[];
  readonly agreementDates: ReadonlyMap<string, { readonly start: string; readonly due: string }>;
}

export interface OriginalDatesManifest {
  readonly kind: 'original-dates-migration';
  readonly database: string;
  readonly appliedAt: string;
  readonly agreement: readonly string[];
  readonly baseline: readonly string[];
  readonly creationMarked: readonly string[];
}

export const planOriginalDates = async (): Promise<OriginalDatesPlan> => {
  const totalTasks = await TaskModel.estimatedDocumentCount().exec();

  const creationUnmarked = await TaskModel.find({
    originalStartDate: { $exists: true },
    originalDatesSource: { $exists: false },
  })
    .select('_id')
    .lean<{ _id: Types.ObjectId }[]>()
    .exec();

  const missing = await TaskModel.find({ originalStartDate: { $exists: false } })
    .select('_id kind')
    .lean<{ _id: Types.ObjectId; kind: string }[]>()
    .exec();

  const agreements = await MessageModel.find({
    kind: 'agreement',
    'agreement.state': 'accepted',
    'agreement.task': { $in: missing.map((row) => row._id) },
  })
    .select('agreement.task agreement.startDate agreement.dueDate')
    .lean<{ agreement: { task: Types.ObjectId; startDate: string; dueDate: string } }[]>()
    .exec();

  const linked = new Map<string, { start: string; due: string }[]>();
  for (const row of agreements) {
    const key = row.agreement.task.toString();
    linked.set(key, [...(linked.get(key) ?? []), { start: row.agreement.startDate, due: row.agreement.dueDate }]);
  }

  const conflicts: { task: string; reason: string }[] = [];
  const agreementDates = new Map<string, { start: string; due: string }>();
  for (const [task, dates] of linked) {
    const [only] = dates;
    if (dates.length > 1) conflicts.push({ task, reason: 'linked to more than one accepted agreement' });
    else if (only === undefined || !CALENDAR.test(only.start) || !CALENDAR.test(only.due)) {
      conflicts.push({ task, reason: 'agreement dates are not calendar dates' });
    } else agreementDates.set(task, only);
  }

  const baseline: string[] = [];
  let projectLeftUnknown = 0;
  for (const row of missing) {
    const key = row._id.toString();
    if (linked.has(key)) continue;
    if (row.kind === 'standalone') baseline.push(key);
    else projectLeftUnknown += 1;
  }

  return {
    totalTasks,
    missing: missing.length,
    fromAgreement: [...agreementDates.keys()],
    baseline,
    projectLeftUnknown,
    creationUnmarked: creationUnmarked.map((row) => row._id.toString()),
    conflicts,
    agreementDates,
  };
};

export const applyOriginalDates = async (database: string): Promise<OriginalDatesManifest> => {
  const plan = await planOriginalDates();
  const agreement: string[] = [];
  const baseline: string[] = [];
  const creationMarked: string[] = [];

  for (const id of plan.creationUnmarked) {
    const done = await TaskModel.updateOne(
      { _id: new Types.ObjectId(id), originalStartDate: { $exists: true }, originalDatesSource: { $exists: false } },
      { $set: { originalDatesSource: 'creation' } },
    ).exec();
    if (done.modifiedCount === 1) creationMarked.push(id);
  }

  for (const [id, dates] of plan.agreementDates) {
    const done = await TaskModel.updateOne(
      { _id: new Types.ObjectId(id), originalStartDate: { $exists: false } },
      {
        $set: {
          originalStartDate: asDate(dates.start),
          originalDueDate: asDate(dates.due),
          originalDatesSource: 'agreement',
        },
      },
    ).exec();
    if (done.modifiedCount === 1) agreement.push(id);
  }

  for (const id of plan.baseline) {
    const row = await TaskModel.findOne({ _id: new Types.ObjectId(id), originalStartDate: { $exists: false } })
      .select('startDate dueDate')
      .lean<{ startDate: Date; dueDate: Date }>()
      .exec();
    if (row === null) continue;
    const done = await TaskModel.updateOne(
      { _id: new Types.ObjectId(id), originalStartDate: { $exists: false } },
      {
        $set: {
          originalStartDate: row.startDate,
          originalDueDate: row.dueDate,
          originalDatesSource: 'migration_baseline',
        },
      },
    ).exec();
    if (done.modifiedCount === 1) baseline.push(id);
  }

  return {
    kind: 'original-dates-migration',
    database,
    appliedAt: new Date().toISOString(),
    agreement,
    baseline,
    creationMarked,
  };
};

export interface RollbackReport {
  readonly agreementReverted: number;
  readonly baselineReverted: number;
  readonly creationUnmarked: number;
  /** Manifest rows that no longer carry the value the migration wrote — left alone. */
  readonly skipped: number;
}

export const rollbackOriginalDates = async (
  manifest: OriginalDatesManifest,
  apply: boolean,
): Promise<RollbackReport> => {
  const ids = (list: readonly string[]) => list.map((id) => new Types.ObjectId(id));
  const unsetAll = { $unset: { originalStartDate: '', originalDueDate: '', originalDatesSource: '' } };
  const total = manifest.agreement.length + manifest.baseline.length + manifest.creationMarked.length;

  if (!apply) {
    const count = (source: OriginalDatesSource, list: readonly string[]) =>
      TaskModel.countDocuments({ _id: { $in: ids(list) }, originalDatesSource: source }).exec();
    const agreementReverted = await count('agreement', manifest.agreement);
    const baselineReverted = await count('migration_baseline', manifest.baseline);
    const creationUnmarked = await count('creation', manifest.creationMarked);
    return {
      agreementReverted,
      baselineReverted,
      creationUnmarked,
      skipped: total - agreementReverted - baselineReverted - creationUnmarked,
    };
  }

  const agreementDone = await TaskModel.updateMany(
    { _id: { $in: ids(manifest.agreement) }, originalDatesSource: 'agreement' },
    unsetAll,
  ).exec();
  const baselineDone = await TaskModel.updateMany(
    { _id: { $in: ids(manifest.baseline) }, originalDatesSource: 'migration_baseline' },
    unsetAll,
  ).exec();
  const creationDone = await TaskModel.updateMany(
    { _id: { $in: ids(manifest.creationMarked) }, originalDatesSource: 'creation' },
    { $unset: { originalDatesSource: '' } },
  ).exec();

  const done = agreementDone.modifiedCount + baselineDone.modifiedCount + creationDone.modifiedCount;
  return {
    agreementReverted: agreementDone.modifiedCount,
    baselineReverted: baselineDone.modifiedCount,
    creationUnmarked: creationDone.modifiedCount,
    skipped: total - done,
  };
};

const flag = (name: string): string | undefined => {
  const hit = process.argv.find((arg) => arg === `--${name}` || arg.startsWith(`--${name}=`));
  if (hit === undefined) return undefined;
  return hit.includes('=') ? hit.slice(hit.indexOf('=') + 1) : '';
};

const run = async (): Promise<void> => {
  loadEnvFile({ quiet: true });
  await connectToDatabase(loadConfig().mongoUri);

  const database = mongoose.connection.db?.databaseName ?? '';
  const host = mongoose.connection.host;
  const apply = flag('apply') !== undefined;
  const confirmed = flag('confirm-db');
  const rollbackFile = flag('rollback');

  console.log(`target: host ${host} · database ${database}`);
  console.log(`mode:   ${rollbackFile ? 'ROLLBACK' : 'MIGRATE'} · ${apply ? 'APPLY (writes)' : 'DRY RUN (read-only)'}`);

  if ((apply || rollbackFile) && confirmed !== database) {
    console.error(`refused: --confirm-db must name the connected database (${database}).`);
    await disconnectFromDatabase();
    process.exit(2);
  }

  if (rollbackFile) {
    const manifest = JSON.parse(readFileSync(rollbackFile, 'utf8')) as OriginalDatesManifest;
    if (manifest.kind !== 'original-dates-migration' || manifest.database !== database) {
      console.error(`refused: the manifest was written for database "${manifest.database}".`);
      await disconnectFromDatabase();
      process.exit(2);
    }
    const report = await rollbackOriginalDates(manifest, apply);
    const verb = apply ? 'reverted' : 'would revert';
    console.log(`${verb} agreement originals:   ${report.agreementReverted}`);
    console.log(`${verb} migration baselines:   ${report.baselineReverted}`);
    console.log(`${verb} creation markers:      ${report.creationUnmarked}`);
    console.log(`skipped (value changed since):  ${report.skipped}`);
    if (!apply) console.log('\nDRY RUN — nothing was written.');
    await disconnectFromDatabase();
    return;
  }

  const plan = await planOriginalDates();
  console.log(`tasks in collection:                         ${plan.totalTasks}`);
  console.log(`tasks without originals:                     ${plan.missing}`);
  console.log(`  → originals from accepted agreements:      ${plan.fromAgreement.length}`);
  console.log(`  → standalone baselines from current dates: ${plan.baseline.length}`);
  console.log(`  → project tasks left unknown (by design):  ${plan.projectLeftUnknown}`);
  console.log(`  → conflicts, reported and skipped:         ${plan.conflicts.length}`);
  for (const row of plan.conflicts) console.log(`      ${row.task}: ${row.reason}`);
  console.log(`stamped rows missing their source marker:    ${plan.creationUnmarked.length}`);

  if (!apply) {
    console.log('\nDRY RUN — nothing was written.');
    await disconnectFromDatabase();
    return;
  }

  const manifest = await applyOriginalDates(database);
  const directory = flag('manifest-dir') || join(homedir(), '.blokta-qa', 'migrations');
  mkdirSync(directory, { recursive: true });
  const file = join(directory, `original-dates-${database}-${manifest.appliedAt.replaceAll(':', '-')}.json`);
  writeFileSync(file, `${JSON.stringify(manifest, null, 2)}\n`, { mode: 0o600 });

  console.log(`\napplied: agreement ${manifest.agreement.length} · baseline ${manifest.baseline.length} · creation markers ${manifest.creationMarked.length}`);
  console.log(`manifest: ${file}`);
  await disconnectFromDatabase();
};

if (process.argv[1]?.endsWith('migrate-original-dates.ts')) {
  run().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
