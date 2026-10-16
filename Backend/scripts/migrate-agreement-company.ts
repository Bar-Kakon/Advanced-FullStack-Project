/**
 * One-time backfill: stamps `agreement.commissioningCompany` onto every agreement message written
 * before the stamp existed, from its proposer's single membership — exact for every legacy row,
 * because no account has ever held two company relationships before this batch shipped rejoining.
 *
 * A proposer with no membership, or more than one, is REPORTED AND SKIPPED — never guessed. The
 * claim endpoint refuses new membership periods while any accepted agreement remains unstamped,
 * so running this (and reviewing its counts) is what unlocks rejoining.
 *
 *   npm run migrate:agreement-company
 */
import { config as loadEnvFile } from 'dotenv';
import { Types } from 'mongoose';

import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { loadConfig } from '../src/config/env.js';
import { CompanyMembershipModel } from '../src/features/companies/companyMembership.model.js';
import { MessageModel } from '../src/features/messaging/message.model.js';

const run = async (): Promise<void> => {
  loadEnvFile({ quiet: true });
  await connectToDatabase(loadConfig().mongoUri);

  const unstamped = await MessageModel.find({
    kind: 'agreement',
    'agreement.commissioningCompany': { $exists: false },
  })
    .select('_id sender')
    .lean<{ _id: Types.ObjectId; sender: Types.ObjectId }[]>()
    .exec();

  const bySender = new Map<string, Types.ObjectId[]>();
  for (const row of unstamped) {
    const key = row.sender.toString();
    bySender.set(key, [...(bySender.get(key) ?? []), row._id]);
  }

  let stamped = 0;
  let skipped = 0;
  const ambiguous: string[] = [];

  for (const [sender, messageIds] of bySender) {
    const memberships = await CompanyMembershipModel.find({ user: new Types.ObjectId(sender) })
      .select('company')
      .lean<{ company: Types.ObjectId }[]>()
      .exec();

    const companies = [...new Set(memberships.map((row) => row.company.toString()))];
    if (companies.length !== 1) {
      skipped += messageIds.length;
      ambiguous.push(`${sender} (${companies.length} companies, ${messageIds.length} agreements)`);
      continue;
    }

    const result = await MessageModel.updateMany(
      { _id: { $in: messageIds } },
      { $set: { 'agreement.commissioningCompany': new Types.ObjectId(companies[0]) } },
    ).exec();
    stamped += result.modifiedCount;
  }

  console.log(`Agreements needing a stamp: ${unstamped.length}`);
  console.log(`Stamped: ${stamped}`);
  console.log(`Skipped (ambiguous or missing membership): ${skipped}`);
  for (const line of ambiguous) console.log(`  AMBIGUOUS: ${line}`);

  const remaining = await MessageModel.countDocuments({
    kind: 'agreement',
    'agreement.state': 'accepted',
    'agreement.task': { $exists: true },
    'agreement.commissioningCompany': { $exists: false },
  }).exec();
  console.log(`Accepted agreements still unstamped (the claim guard counts these): ${remaining}`);

  await disconnectFromDatabase();
};

run().catch(async (error: unknown) => {
  console.error(error);
  await disconnectFromDatabase().catch(() => undefined);
  process.exit(1);
});
