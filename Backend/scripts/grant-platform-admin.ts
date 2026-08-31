/**
 * Grants or revokes platform moderation authority, by email.
 *
 * This is the only way `isAdmin` is ever written. There is deliberately no endpoint: an API that
 * can promote an account is an API that can be reached, and platform authority has no self-serve
 * path in the product. Run it against the database directly, by someone who already has one.
 *
 *   npm run admin:grant  -- someone@example.com
 *   npm run admin:revoke -- someone@example.com
 */
import { config as loadEnvFile } from 'dotenv';

import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { loadConfig } from '../src/config/env.js';
import { UserModel } from '../src/features/users/user.model.js';

const run = async (): Promise<void> => {
  loadEnvFile({ quiet: true });

  const [, , mode, email] = process.argv;
  if (mode !== 'grant' && mode !== 'revoke') {
    throw new Error('Usage: tsx scripts/grant-platform-admin.ts <grant|revoke> <email>');
  }
  if (!email) throw new Error('An email address is required.');

  await connectToDatabase(loadConfig().mongoUri);

  const result = await UserModel.updateOne(
    { email: email.toLowerCase().trim() },
    { $set: { isAdmin: mode === 'grant' } },
  ).exec();

  if (result.matchedCount === 0) {
    console.log(`No account found for ${email}. Nothing changed.`);
  } else {
    console.log(`${mode === 'grant' ? 'Granted' : 'Revoked'} platform moderation authority: ${email}`);
  }

  await disconnectFromDatabase();
};

run().catch(async (error: unknown) => {
  console.error(error);
  await disconnectFromDatabase().catch(() => undefined);
  process.exit(1);
});
