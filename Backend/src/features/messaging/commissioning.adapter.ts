import type { CompanyContextService } from '../companies/companyContext.service.js';
import type { CommissioningPort } from './messaging.service.js';

/** Commissioning authority is the company capability `task.create` on an ACTIVE membership. */
export const createCommissioningAdapter = (companyContext: CompanyContextService): CommissioningPort => ({
  async mayCommissionWork(userId) {
    const context = await companyContext.forUser(userId);
    return context !== null && context.membershipStatus === 'active' && context.permissions.includes('task.create');
  },
});
