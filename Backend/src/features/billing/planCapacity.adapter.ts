import { Types } from 'mongoose';

import { companyMembershipRepository } from '../companies/companyMembership.repository.js';
import { projectRepository } from '../projects/project.repository.js';
import type { PlanCapacityPort } from '../projects/planCapacity.port.js';
import { createEntitlementService } from './entitlements.service.js';
import { planRepository } from './plan.repository.js';
import { userRepository } from '../users/user.repository.js';

/**
 * Answers the projects feature's capacity question from the subscription domain.
 *
 * **Whose plan governs a company's projects.** A subscription belongs to a person, a project
 * belongs to a business, and the approved screen sells "projects you manage". The plan consulted
 * here is therefore the one held by the company's OWNER — the Main Contractor seat, which
 * registration always creates for whoever opened the business — and the count is that company's
 * projects. An employee creating a project spends the business's capacity, not their own, which is
 * the only reading under which a limit sold to one person means anything for a company.
 *
 * A company with no owner seat is not blocked: the limit is not applied rather than applied
 * wrongly, because refusing a legitimate project is the worse failure of the two.
 */
export const planCapacityAdapter: PlanCapacityPort = {
  async mayOpenAnotherProject(companyId) {
    if (!Types.ObjectId.isValid(companyId)) return true;

    const company = new Types.ObjectId(companyId);
    const seat = await companyMembershipRepository.findMainContractorSeat(company);
    const owner = seat?.user ?? null;
    if (owner === null) return true;

    const entitlements = createEntitlementService({ plans: planRepository, users: userRepository });
    const limit = await entitlements.limitFor(owner.toString(), 'activeProjects');
    if (limit === null) return true;

    return (await projectRepository.countByCompany(company)) < limit;
  },
};
