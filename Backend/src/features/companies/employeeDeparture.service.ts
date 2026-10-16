import { Types } from 'mongoose';

import type { DbSession } from '../../db/mongoose.js';
import type { NotificationDispatchService } from '../notifications/notificationDispatch.service.js';
import type {
  AssignedArrangementInput,
  CommissionArrangementInput,
  DepartureWorkDto,
  DepartureWorkService,
} from '../tasks/departureWork.service.js';
import type { AgreementOriginPort } from '../tasks/agreementOrigin.port.js';
import type { CompanyRepository } from './company.repository.js';
import type { CompanyMembershipRepository } from './companyMembership.repository.js';
import type { CompanyRecord } from './company.model.js';
import type { CompanyPosition } from './companyMembership.model.js';
import {
  claimBlockedByMigration,
  noActiveCompany,
  notPermittedToManagePermissions,
  ownerCannotLeave,
  permissionsTargetNotFound,
} from './company.errors.js';

export interface DepartureArrangementsInput {
  readonly commissions: readonly CommissionArrangementInput[];
  readonly assigned: readonly AssignedArrangementInput[];
}

export interface EmployeeDepartureService {
  /** The owner's workbench: one member's unsettled work, before or after their departure. */
  workFor(ownerId: string, memberUserId: string): Promise<DepartureWorkDto>;
  /** Saved arrangements, before or after departure. All-or-nothing. */
  arrange(ownerId: string, memberUserId: string, input: DepartureArrangementsInput): Promise<void>;
  /** Owner-initiated removal: arrangements, defaults, deactivation — one transaction. */
  offboard(
    ownerId: string,
    membershipId: string,
    arrangements: DepartureArrangementsInput | undefined,
  ): Promise<void>;
  /** The employee's own exit. No owner presence required; the owner is notified after commit. */
  leave(userId: string): Promise<void>;
  /** An existing, company-less account claims an open seat — gated by the migration safeguard. */
  claimSeat(
    userId: string,
    input: { companyName: string; companyPosition: CompanyPosition },
  ): Promise<void>;
  setDepartureDefaults(
    ownerId: string,
    defaults: NonNullable<CompanyRecord['departureDefaults']>,
  ): Promise<void>;
}

export interface EmployeeDepartureDependencies {
  readonly memberships: CompanyMembershipRepository;
  readonly companies: CompanyRepository;
  readonly departureWork: DepartureWorkService;
  readonly origins: AgreementOriginPort;
  readonly notifications: NotificationDispatchService;
  readonly transactions: { run<T>(work: (session: DbSession) => Promise<T>): Promise<T> };
  readonly participants: {
    findByIds(ids: readonly Types.ObjectId[]): Promise<
      readonly { _id: Types.ObjectId; firstName: string; lastName: string }[]
    >;
  };
  readonly findOpenInvitations: (query: {
    companyIds: readonly Types.ObjectId[];
    invitedFullName: string;
    companyPosition: CompanyPosition;
  }) => Promise<readonly { _id: Types.ObjectId }[]>;
  readonly claimInvitation: (
    invitation: Types.ObjectId,
    user: Types.ObjectId,
    session?: DbSession,
  ) => Promise<boolean>;
}

export const createEmployeeDepartureService = ({
  memberships,
  companies,
  departureWork,
  origins,
  notifications,
  transactions,
  participants,
  findOpenInvitations,
  claimInvitation,
}: EmployeeDepartureDependencies): EmployeeDepartureService => {
  /** Ownership is the only authority here — never a title, never another permission. */
  const requireOwner = async (ownerId: string) => {
    const actor = await memberships.findActiveByUser(ownerId);
    if (actor === null) throw noActiveCompany();
    if (actor.standing !== 'owner') throw notPermittedToManagePermissions();
    return actor;
  };

  /** A member of the owner's company — active for pre-departure work, inactive for after. */
  const requireCompanyMember = async (company: Types.ObjectId, memberUserId: string) => {
    if (!Types.ObjectId.isValid(memberUserId)) throw permissionsTargetNotFound();
    const rows = await memberships.listByCompany(company);
    const row = rows.find(
      (candidate) =>
        candidate.user !== null &&
        candidate.user.toString() === memberUserId &&
        candidate.standing === 'employee',
    );
    if (row === undefined) throw permissionsTargetNotFound();
    return row;
  };

  return {
    async workFor(ownerId, memberUserId) {
      const owner = await requireOwner(ownerId);
      await requireCompanyMember(owner.company, memberUserId);
      return departureWork.listFor(owner.company, new Types.ObjectId(memberUserId));
    },

    async arrange(ownerId, memberUserId, input) {
      const owner = await requireOwner(ownerId);
      await requireCompanyMember(owner.company, memberUserId);

      await transactions.run(async (session) => {
        await departureWork.applyArrangements(
          new Types.ObjectId(ownerId),
          owner.company,
          new Types.ObjectId(memberUserId),
          input,
          session,
        );
      });
    },

    async offboard(ownerId, membershipId, arrangements) {
      const owner = await requireOwner(ownerId);
      const rows = await memberships.listByCompany(owner.company);
      const target = rows.find((row) => row._id.toString() === membershipId);
      if (
        target === undefined ||
        target.user === null ||
        target.standing !== 'employee' ||
        target.status !== 'active'
      ) {
        throw permissionsTargetNotFound();
      }
      const departing = target.user;
      const company = await companies.findById(owner.company);

      await transactions.run(async (session) => {
        if (arrangements !== undefined) {
          await departureWork.applyArrangements(
            new Types.ObjectId(ownerId),
            owner.company,
            departing,
            arrangements,
            session,
          );
        }
        await departureWork.applyDefaultsAndFallback(
          new Types.ObjectId(ownerId),
          owner.company,
          departing,
          company?.departureDefaults,
          session,
        );
        const moved = await memberships.deactivateEmployee(owner.company, membershipId, session);
        if (moved === 0) throw permissionsTargetNotFound();
      });
    },

    async leave(userId) {
      const actor = await memberships.findActiveByUser(userId);
      if (actor === null) throw noActiveCompany();
      if (actor.standing !== 'employee') throw ownerCannotLeave();

      const company = await companies.findById(actor.company);
      const owner = (await memberships.listByCompany(actor.company)).find(
        (row) => row.standing === 'owner' && row.status === 'active' && row.user !== null,
      );
      const ownerUser = owner?.user ?? null;
      if (ownerUser === null) throw noActiveCompany();

      await transactions.run(async (session) => {
        // The owner is the accountable fallback; their saved preferences apply without them online.
        await departureWork.applyDefaultsAndFallback(
          ownerUser,
          actor.company,
          actor.user as Types.ObjectId,
          company?.departureDefaults,
          session,
        );
        const moved = await memberships.deactivateSelfEmployee(userId, session);
        if (moved === 0) throw noActiveCompany();
      });

      const [person] = await participants.findByIds([actor.user as Types.ObjectId]);
      await notifications.emit({
        userId: ownerUser,
        type: 'company.employee_left',
        payload: {
          actorName: person === undefined ? '' : `${person.firstName} ${person.lastName}`.trim(),
        },
        dedupeKey: `employee-left:${(actor.user as Types.ObjectId).toString()}:${Date.now()}`,
      });
    },

    async claimSeat(userId, input) {
      // The structural migration safeguard: no second membership period can exist anywhere while
      // a single accepted agreement still lacks its immutable company stamp.
      if ((await origins.countUnstamped()) > 0) throw claimBlockedByMigration();

      const current = await memberships.findCurrentByUser(userId);
      if (current !== null) throw permissionsTargetNotFound();

      const [person] = await participants.findByIds([new Types.ObjectId(userId)]);
      if (person === undefined) throw permissionsTargetNotFound();

      const companyIds = await companies.findIdsByName(input.companyName);
      if (companyIds.length === 0) throw permissionsTargetNotFound();

      const matches = await findOpenInvitations({
        companyIds,
        invitedFullName: `${person.firstName} ${person.lastName}`.trim(),
        companyPosition: input.companyPosition,
      });
      if (matches.length !== 1) throw permissionsTargetNotFound();

      const claimed = await claimInvitation(matches[0]!._id, new Types.ObjectId(userId));
      if (!claimed) throw permissionsTargetNotFound();
    },

    async setDepartureDefaults(ownerId, defaults) {
      const owner = await requireOwner(ownerId);
      await companies.setDepartureDefaults(owner.company, defaults);
    },
  };
};
