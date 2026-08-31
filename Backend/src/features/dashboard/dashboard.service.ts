import type { Types } from 'mongoose';

import type { BlocksService } from '../blocks/blocks.service.js';
import type { CompanyRepository } from '../companies/company.repository.js';
import type { CompanyMembershipRepository } from '../companies/companyMembership.repository.js';
import type { CompanyMembershipRecord } from '../companies/companyMembership.model.js';
import type { ConnectionRepository } from '../connections/connection.repository.js';
import type { RatingRepository } from '../ratings/rating.repository.js';
import type { UserRepository } from '../users/user.repository.js';
import type { WorkEntryRepository } from '../workentries/workEntry.repository.js';
import { dashboardUserNotFound } from './dashboard.errors.js';
import type {
  DashboardCompanyDto,
  DashboardDto,
  DashboardNetworkDto,
  DashboardTeamDto,
  ProfileReminderDto,
} from './dashboard.dto.js';
import { missingProfileItems, reminderIsDismissed } from './profileCompletion.service.js';
import { PROFILE_REMINDER_MODEL_VERSION } from './profileReminderDismissal.model.js';
import type { ProfileReminderDismissalRepository } from './profileReminderDismissal.repository.js';

export interface DashboardService {
  forUser(userId: string): Promise<DashboardDto>;
  dismissProfileReminder(userId: string): Promise<ProfileReminderDto>;
}

export interface DashboardDependencies {
  readonly users: UserRepository;
  readonly companies: CompanyRepository;
  readonly memberships: CompanyMembershipRepository;
  readonly connections: ConnectionRepository;
  readonly blocks: BlocksService;
  readonly ratings: RatingRepository;
  readonly workEntries: WorkEntryRepository;
  readonly dismissals: ProfileReminderDismissalRepository;
  readonly pendingActions: PendingActionsSource;
}

export interface PendingActionsSource {
  totalsFor(userId: string): Promise<{ proposals: number; handoffs: number; total: number }>;
}

const countNetwork = (
  edges: readonly { requester: Types.ObjectId; recipient: Types.ObjectId; status: string }[],
  userId: string,
  blocked: number,
): DashboardNetworkDto => {
  let connected = 0;
  let incoming = 0;
  let outgoing = 0;

  for (const edge of edges) {
    if (edge.status === 'accepted') connected += 1;
    else if (edge.status === 'pending') {
      if (edge.requester.toString() === userId) outgoing += 1;
      else incoming += 1;
    }
  }

  return { connected, incoming, outgoing, blocked };
};

const countTeam = (memberships: readonly CompanyMembershipRecord[]): DashboardTeamDto => ({
  pendingApproval: memberships.filter((row) => row.status === 'pending_company_approval').length,
  openInvitations: memberships.filter((row) => row.status === 'invited').length,
  active: memberships.filter((row) => row.status === 'active').length,
});

export const createDashboardService = ({
  users,
  companies,
  memberships,
  connections,
  blocks,
  ratings,
  workEntries,
  dismissals,
  pendingActions,
}: DashboardDependencies): DashboardService => {
  const load = async (userId: string) => {
    const user = await users.findProfileById(userId);
    if (user === null || user.status !== 'active') throw dashboardUserNotFound();

    const membership = await memberships.findCurrentByUser(userId);
    const company = membership === null ? null : await companies.findById(membership.company);

    const canManageCompany =
      membership !== null &&
      membership.status === 'active' &&
      membership.permissions.includes('company.invite_employees');

    const [edges, myBlocks, ratingSummary, work, dismissal] = await Promise.all([
      connections.listForUser(userId),
      blocks.listMyBlocks(userId),
      ratings.summaryFor(userId),
      workEntries.listByOwner(user._id),
      dismissals.findByUser(userId),
    ]);

    const team =
      canManageCompany && membership !== null
        ? countTeam(await memberships.listByCompany(membership.company))
        : null;

    const missing = missingProfileItems({
      user,
      company,
      canManageCompany,
      completedWorkCount: work.length,
    });

    return { user, membership, company, edges, myBlocks, ratingSummary, work, dismissal, team, missing };
  };

  const buildReminder = (
    missing: ReturnType<typeof missingProfileItems>,
    dismissedKeys: readonly string[] | null,
  ): ProfileReminderDto => {
    const keys = missing.map((item) => item.key);

    return {
      visible: missing.length > 0 && !reminderIsDismissed(keys, dismissedKeys),
      version: PROFILE_REMINDER_MODEL_VERSION,
      missing,
      dismissedKeys: dismissedKeys ?? [],
    };
  };

  return {
    async forUser(userId) {
      const state = await load(userId);
      const { user, membership, company } = state;

      const companyDto: DashboardCompanyDto | null =
        membership === null || company === null
          ? null
          : {
              id: company._id.toString(),
              name: company.name,
              standing: membership.standing,
              companyPosition: membership.companyPosition ?? null,
              availability: company.availability,
            };

      return {
        identity: {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          avatarUrl:
            user.avatar?.fileId === undefined
              ? null
              : `/api/users/me/assets/${user.avatar.fileId.toString()}`,
        },
        company: companyDto,
        network: countNetwork(state.edges, userId, state.myBlocks.length),
        team: state.team,
        reputation: {
          rating: state.ratingSummary
            ? { average: state.ratingSummary.average, count: state.ratingSummary.count }
            : null,
          completedWork: state.work.length,
        },
        profileReminder: buildReminder(state.missing, state.dismissal?.dismissedKeys ?? null),
        pendingActions: await pendingActions.totalsFor(userId),
      };
    },

    async dismissProfileReminder(userId) {
      const state = await load(userId);
      const keys = state.missing.map((item) => item.key);

      await dismissals.upsert(userId, PROFILE_REMINDER_MODEL_VERSION, keys);

      return buildReminder(state.missing, keys);
    },
  };
};
