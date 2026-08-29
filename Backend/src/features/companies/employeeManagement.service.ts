import type { Types } from 'mongoose';

import {
  EMPLOYEE_DEFAULT_PERMISSIONS,
  OWNER_COMPANY_POSITION,
  type CompanyMembershipRecord,
} from './companyMembership.model.js';
import type { CompanyMembershipRepository } from './companyMembership.repository.js';
import type { CompanyRepository } from './company.repository.js';
import {
  mainContractorSeatTaken,
  noActiveCompany,
  notPermittedToManageEmployees,
  nothingToApprove,
  nothingToCancel,
} from './company.errors.js';
import type { CreateInvitationBody } from './employeeManagement.validation.js';

/** The capability that names this whole surface: add and invite employees. */
const REQUIRED_PERMISSION = 'company.invite_employees';

export interface EmployeeManagementService {
  invite(actorId: string, input: CreateInvitationBody): Promise<Types.ObjectId>;
  list(actorId: string): Promise<CompanyMembershipRecord[]>;
  approve(actorId: string, membershipId: string): Promise<number>;
  approveAllPending(actorId: string): Promise<number>;
  /** Withdraws a seat nobody has claimed. Never touches a membership someone already holds. */
  cancelInvitation(actorId: string, membershipId: string): Promise<void>;
  /** Records that this business has been through employee setup, by inviting or by skipping. */
  completeEmployeeSetup(actorId: string): Promise<void>;
}

export interface EmployeeManagementDependencies {
  readonly memberships: CompanyMembershipRepository;
  readonly companies: CompanyRepository;
}

export const createEmployeeManagementService = ({
  memberships,
  companies,
}: EmployeeManagementDependencies): EmployeeManagementService => {
  /**
   * Authority comes from the permission recorded on the caller's own active membership, never from
   * their standing and never from their job title. An owner has it because signup granted it
   * explicitly; anybody else has it only if it was granted to them.
   */
  const requireManager = async (actorId: string): Promise<Types.ObjectId> => {
    const actor = await memberships.findActiveByUser(actorId);
    if (actor === null) throw noActiveCompany();
    if (!actor.permissions.includes(REQUIRED_PERMISSION)) throw notPermittedToManageEmployees();

    return actor.company;
  };

  return {
    /** Opens a seat: a row with no user, which a later self-registration matches and claims. */
    async invite(actorId, { fullName, companyPosition }) {
      const company = await requireManager(actorId);

      if (companyPosition === OWNER_COMPANY_POSITION) {
        const held = await memberships.findMainContractorSeat(company);
        if (held !== null) throw mainContractorSeatTaken();
      }

      return memberships.create({
        company,
        user: null,
        invitedFullName: fullName,
        standing: 'employee',
        status: 'invited',
        companyPosition,
        permissions: EMPLOYEE_DEFAULT_PERMISSIONS,
      });
    },

    async list(actorId) {
      return memberships.listByCompany(await requireManager(actorId));
    },

    async approve(actorId, membershipId) {
      const company = await requireManager(actorId);
      const moved = await memberships.approve(company, membershipId);
      if (moved === 0) throw nothingToApprove();

      return moved;
    },

    async cancelInvitation(actorId, membershipId) {
      const company = await requireManager(actorId);
      const moved = await memberships.cancelInvitation(company, membershipId);
      if (moved === 0) throw nothingToCancel();
    },

    /** Approving every waiting activation at once, which the employee-management flow requires. */
    async approveAllPending(actorId) {
      return memberships.approveAllPending(await requireManager(actorId));
    },

    /** Skipping and finishing are the same fact, so they are one call and one stamp. */
    async completeEmployeeSetup(actorId) {
      await companies.markEmployeeSetupComplete(await requireManager(actorId), new Date());
    },
  };
};
