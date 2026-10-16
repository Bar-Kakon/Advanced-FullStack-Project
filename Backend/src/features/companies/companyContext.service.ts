import type { Types } from 'mongoose';

import { RECOVERY_WINDOW_DAYS } from '../users/user.model.js';
import { userRepository } from '../users/user.repository.js';
import type { CompanyRepository } from './company.repository.js';
import {
  CURRENT_MEMBERSHIP_STATUSES,
  type CompanyMembershipStatus,
  type CompanyPermission,
  type CompanyStanding,
} from './companyMembership.model.js';
import { companyMembershipRepository } from './companyMembership.repository.js';
import type { CompanyMembershipRepository } from './companyMembership.repository.js';

const DAY_MS = 86_400_000;

/**
 * Whether the company's owner is still with the platform — derived, never stored, so it can
 * neither drift from the account lifecycle nor survive a restoration it should not.
 *
 * `active`: the owner's account is live. `recovery`: the owner deleted their account and is
 * inside the 60-day window, so restoring them reactivates the company by itself. `inactive`:
 * the window passed (or the owner was anonymized, or no current owner row exists at all).
 */
export type CompanyOwnerState = 'active' | 'recovery' | 'inactive';

export const companyOwnerStateFor = async (
  company: Types.ObjectId,
): Promise<CompanyOwnerState> => {
  const rows = await companyMembershipRepository.listByCompany(company);
  const owner = rows.find(
    (row) =>
      row.standing === 'owner' &&
      row.user !== null &&
      (CURRENT_MEMBERSHIP_STATUSES as readonly string[]).includes(row.status),
  );
  if (owner === undefined || owner.user === null) return 'inactive';

  const life = await userRepository.findLifecycleState(owner.user.toString());
  if (life === null) return 'inactive';
  if (life.status !== 'deleted') return 'active';
  if (life.anonymizedAt !== undefined) return 'inactive';
  if (life.deletedAt === undefined) return 'inactive';

  const windowEnds = life.deletedAt.getTime() + RECOVERY_WINDOW_DAYS * DAY_MS;
  return windowEnds > Date.now() ? 'recovery' : 'inactive';
};

/**
 * What a session needs about the caller's company, and nothing else — no name, phone or
 * availability, which belong to the profile feature. `membershipStatus` stays a code because no
 * boolean separates waiting for approval from a relationship that ended.
 */
export interface CompanyContext {
  readonly id: string;
  readonly standing: CompanyStanding;
  readonly membershipStatus: CompanyMembershipStatus;
  readonly permissions: readonly CompanyPermission[];
  /** Whether this business has been through employee setup, by inviting somebody or by skipping. */
  readonly employeeSetupComplete: boolean;
  /** Derived from the owner's account lifecycle. Anything but `active` empties `permissions`. */
  readonly ownerState: CompanyOwnerState;
}

export interface CompanyContextService {
  forUser(userId: string): Promise<CompanyContext | null>;
}

export interface CompanyContextDependencies {
  readonly memberships: CompanyMembershipRepository;
  readonly companies: CompanyRepository;
}

export const createCompanyContextService = ({
  memberships,
  companies,
}: CompanyContextDependencies): CompanyContextService => ({
  /** `null` means no relationship at all — not the same as one that is not active yet. */
  async forUser(userId) {
    const membership = await memberships.findCurrentByUser(userId);
    if (membership === null) return null;

    const company = await companies.findById(membership.company);

    // The caller holding the owner seat IS the active owner — they just authenticated.
    const ownerState =
      membership.standing === 'owner' ? 'active' : await companyOwnerStateFor(membership.company);

    return {
      id: membership.company.toString(),
      standing: membership.standing,
      membershipStatus: membership.status,
      // No active owner, no company authority: every permission-gated company write waits.
      permissions: ownerState === 'active' ? membership.permissions : [],
      // A missing company reads as not set up: offering the step again is the safe direction.
      employeeSetupComplete: company?.employeeSetupCompletedAt !== undefined,
      ownerState,
    };
  },
});
