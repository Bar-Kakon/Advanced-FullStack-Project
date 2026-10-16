import type { ContractorCategory } from './company.model.js';
import type { CompanyRepository } from './company.repository.js';
import type { CompanyMembershipRepository } from './companyMembership.repository.js';

export interface ContractorEligibilityDependencies {
  readonly companies: CompanyRepository;
  readonly memberships: CompanyMembershipRepository;
}

export interface ContractorEligibilityService {
  /** The account-level classification of the business this person belongs to. */
  categoryOf(userId: string): Promise<ContractorCategory | null>;
  mayUseConfidentialDelegation(userId: string): Promise<boolean>;
}

/** The one rule, written once, so no surface can approximate it with a different test. */
export const isConfidentialDelegationEligible = (
  category: ContractorCategory | null,
): boolean => category === 'subcontractor';

export const createContractorEligibilityService = ({
  companies,
  memberships,
}: ContractorEligibilityDependencies): ContractorEligibilityService => {
  const categoryOf = async (userId: string): Promise<ContractorCategory | null> => {
    const membership = await memberships.findActiveByUser(userId);
    if (membership === null) return null;

    const company = await companies.findById(membership.company);

    return company?.contractorCategory ?? null;
  };

  return {
    categoryOf,
    async mayUseConfidentialDelegation(userId) {
      return isConfidentialDelegationEligible(await categoryOf(userId));
    },
  };
};
