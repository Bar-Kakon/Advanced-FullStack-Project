import type { Types } from 'mongoose';

import type { PlatformAuditService } from '../moderation/platformAudit.service.js';
import { recoveryWindowFloor } from './accountLifecycle.service.js';
import type { UserRepository } from './user.repository.js';

/** One page of eligible accounts per sweep; the next sweep continues where this one stopped. */
const SWEEP_PAGE_SIZE = 50;

export interface AnonymizationSweepResult {
  readonly eligible: number;
  readonly anonymized: number;
}

export interface AccountAnonymizationService {
  sweep(): Promise<AnonymizationSweepResult>;
}

export interface AccountAnonymizationDependencies {
  readonly users: UserRepository;
  readonly audit: PlatformAuditService;
}

/** The tombstone is unique per account, so the email unique index stays satisfied for ever. */
const tombstoneEmailFor = (id: Types.ObjectId): string =>
  `deleted.${id.toString()}@anonymized.blokta.invalid`;

/**
 * The D8 step after the window: PII goes, the name stays as business attribution, and the row
 * itself survives so every historical reference keeps resolving. Eligibility is decided from
 * persisted timestamps alone, and the final update re-proves it, so a restoration that lands
 * between the listing and the write simply unmatches the filter.
 */
export const createAccountAnonymizationService = ({
  users,
  audit,
}: AccountAnonymizationDependencies): AccountAnonymizationService => ({
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

    return { eligible: eligible.length, anonymized };
  },
});
