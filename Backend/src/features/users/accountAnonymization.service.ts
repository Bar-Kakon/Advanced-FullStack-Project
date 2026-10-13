import type { Types } from 'mongoose';

import type { FileAssetRepository } from '../files/fileAsset.repository.js';
import type { FileAssetService } from '../files/fileAsset.service.js';
import { logger } from '../../shared/logger.js';
import type { PlatformAuditService } from '../moderation/platformAudit.service.js';
import { recoveryWindowFloor } from './accountLifecycle.service.js';
import type { UserRepository } from './user.repository.js';

/** One page of eligible accounts per sweep; the next sweep continues where this one stopped. */
const SWEEP_PAGE_SIZE = 50;
/** The cleanup pass re-checks this many anonymized accounts for leftover avatar files. */
const CLEANUP_PAGE_SIZE = 200;

export interface AnonymizationSweepResult {
  readonly eligible: number;
  readonly anonymized: number;
  readonly avatarFilesRemoved: number;
}

export interface AccountAnonymizationService {
  sweep(): Promise<AnonymizationSweepResult>;
}

export interface AccountAnonymizationDependencies {
  readonly users: UserRepository;
  readonly audit: PlatformAuditService;
  readonly assets: FileAssetRepository;
  readonly files: FileAssetService;
}

/** The tombstone is unique per account, so the email unique index stays satisfied for ever. */
const tombstoneEmailFor = (id: Types.ObjectId): string =>
  `deleted.${id.toString()}@anonymized.blokta.invalid`;

/**
 * The D8 step after the window: PII goes, the name and profession stay as business attribution,
 * and the row itself survives so every historical reference keeps resolving. Eligibility is
 * decided from persisted timestamps alone, and the final update re-proves it, so a restoration
 * that lands between the listing and the write simply unmatches the filter.
 *
 * The avatar's PHYSICAL file goes too. Cleanup keys on the asset's own owner + scope rather than
 * the user's (already unset) reference, so an interrupted run, a retry, and rows anonymized before
 * cleanup existed are all the same case: the next sweep finds whatever is still there and removes
 * it. An avatar is never shared — it is owner-scoped with no scope id — so nothing else can
 * reference the bytes being removed, and no other scope type is ever touched.
 */
export const createAccountAnonymizationService = ({
  users,
  audit,
  assets,
  files,
}: AccountAnonymizationDependencies): AccountAnonymizationService => {
  const removeAvatarFiles = async (owner: Types.ObjectId): Promise<number> => {
    const rows = await assets.listByOwnerAndScopeType(owner, 'avatar');

    let removed = 0;
    for (const row of rows) {
      try {
        await files.remove(row._id, row.storage.fileId);
        removed += 1;
      } catch (error) {
        // Logged without PII; the row keyed this attempt, so the next sweep retries it.
        logger.error('Avatar cleanup failed for one asset', {
          assetId: row._id.toString(),
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return removed;
  };

  return {
    async sweep() {
      const cutoff = recoveryWindowFloor();
      const eligible = await users.listAnonymizationEligible(cutoff, SWEEP_PAGE_SIZE);

      let anonymized = 0;
      for (const id of eligible) {
        const done = await users.anonymize(id, cutoff, tombstoneEmailFor(id));
        if (!done) continue;
        anonymized += 1;

        await audit.record({
          actorId: id.toString(),
          action: 'account.anonymized',
          targetType: 'user',
          targetId: id.toString(),
          metadata: { automatic: true },
        });
      }

      let avatarFilesRemoved = 0;
      for (const id of await users.listAnonymizedIds(CLEANUP_PAGE_SIZE)) {
        avatarFilesRemoved += await removeAvatarFiles(id);
      }

      return { eligible: eligible.length, anonymized, avatarFilesRemoved };
    },
  };
};
