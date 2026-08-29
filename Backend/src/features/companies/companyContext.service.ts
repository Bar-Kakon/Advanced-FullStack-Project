import type { CompanyRepository } from './company.repository.js';
import type {
  CompanyMembershipStatus,
  CompanyPermission,
  CompanyStanding,
} from './companyMembership.model.js';
import type { CompanyMembershipRepository } from './companyMembership.repository.js';

/**
 * What a session needs to know about the caller's company, and deliberately nothing else. No name,
 * no phone number and no availability: those belong to the profile feature, and a session payload
 * that grows a copy of them is a second answer waiting to disagree with the first.
 *
 * `membershipStatus` is the whole reason this exists. A person waiting for their employer to
 * approve them is authenticated and holds a real relationship, and no boolean can tell that apart
 * from a relationship that ended — so the status is carried as it is, and the client renders it.
 *
 * `permissions` is the canonical capability list. It is what an interface asks before drawing a
 * control, and it is a copy of the record the server itself checks — never a standing and never a
 * job title.
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
  /**
   * `null` means this person holds no company relationship at all, which is a different fact from
   * holding one that is not active yet. Keeping the two apart is what lets a client route a
   * waiting employee to a waiting screen rather than treating them as somebody with no company.
   */
  async forUser(userId) {
    const membership = await memberships.findCurrentByUser(userId);
    if (membership === null) return null;

    const company = await companies.findById(membership.company);

    return {
      id: membership.company.toString(),
      standing: membership.standing,
      membershipStatus: membership.status,
      permissions: membership.permissions,
      // A company the read did not find is reported as not set up rather than as set up: the
      // safe direction is offering the step again, not silently swallowing it.
      employeeSetupComplete: company?.employeeSetupCompletedAt !== undefined,
    };
  },
});
