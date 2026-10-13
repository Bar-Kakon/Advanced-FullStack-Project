/**
 * One anonymization sweep: accounts whose 60-day recovery window has passed lose their PII,
 * while the name is kept as business attribution and every historical reference keeps resolving.
 * The server runs the same sweep hourly; this script exists for operations and verification.
 *
 *   npm run anonymize:accounts
 */
import { config as loadEnvFile } from 'dotenv';

import { connectToDatabase, disconnectFromDatabase } from '../src/db/mongoose.js';
import { loadConfig } from '../src/config/env.js';
import { fileAssetRepository } from '../src/features/files/fileAsset.repository.js';
import { createFileAssetService } from '../src/features/files/fileAsset.service.js';
import { platformAuditService } from '../src/features/moderation/platformAudit.instance.js';
import { createAccountAnonymizationService } from '../src/features/users/accountAnonymization.service.js';
import { userRepository } from '../src/features/users/user.repository.js';

const run = async (): Promise<void> => {
  loadEnvFile({ quiet: true });
  await connectToDatabase(loadConfig().mongoUri);

  const service = createAccountAnonymizationService({
    users: userRepository,
    audit: platformAuditService,
    assets: fileAssetRepository,
    files: createFileAssetService(fileAssetRepository),
  });
  const result = await service.sweep();

  console.log(`Eligible past the window: ${result.eligible}`);
  console.log(`Anonymized this sweep: ${result.anonymized}`);
  console.log(`Avatar files removed: ${result.avatarFilesRemoved}`);

  await disconnectFromDatabase();
};

run().catch(async (error: unknown) => {
  console.error(error);
  await disconnectFromDatabase().catch(() => undefined);
  process.exit(1);
});
