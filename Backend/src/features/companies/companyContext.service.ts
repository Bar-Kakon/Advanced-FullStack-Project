import type { CompanyRepository } from './company.repository.js';
import type {
  CompanyMembershipStatus,
  CompanyPermission,
  CompanyStanding,
} from './companyMembership.model.js';
import type { CompanyMembershipRepository } from './companyMembership.repository.js';

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

    return {
      id: membership.company.toString(),
      standing: membership.standing,
      membershipStatus: membership.status,
      permissions: membership.permissions,
      // A missing company reads as not set up: offering the step again is the safe direction.
      employeeSetupComplete: company?.employeeSetupCompletedAt !== undefined,
    };
  },
});
