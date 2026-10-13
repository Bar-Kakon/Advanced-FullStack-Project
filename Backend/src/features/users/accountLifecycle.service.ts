import { Types } from 'mongoose';

import { AppError } from '../../shared/errors.js';
import type { RefreshTokenRepository } from '../auth/refreshToken.repository.js';
import { CURRENT_MEMBERSHIP_STATUSES } from '../companies/companyMembership.model.js';
import type { CompanyMembershipRepository } from '../companies/companyMembership.repository.js';
import type { PlatformAuditService } from '../moderation/platformAudit.service.js';
import type { TaskRepository } from '../tasks/task.repository.js';
import type { UserRepository } from './user.repository.js';

export const accountAlreadyDeleted = (): AppError =>
  new AppError('This account is already deleted.', 409, 'ACCOUNT_ALREADY_DELETED');

export const accountNotDeleted = (): AppError =>
  new AppError('This account is not deleted.', 409, 'ACCOUNT_NOT_DELETED');

export const accountRestoreNotApplicable = (): AppError =>
  new AppError('That account cannot be restored.', 404, 'ACCOUNT_RESTORE_NOT_APPLICABLE');

export const accountOwnsCompany = (): AppError =>
  new AppError('A company owner closes the company side first.', 409, 'ACCOUNT_OWNS_COMPANY');

export const accountInCompany = (): AppError =>
  new AppError('Leave the company before closing the account.', 409, 'ACCOUNT_IN_COMPANY');

export const accountHasActiveWork = (): AppError =>
  new AppError('Close the open work commitments first.', 409, 'ACCOUNT_HAS_ACTIVE_WORK');

export interface AccountLifecycleService {
  /** The account's own holder, closing it. Recoverable, and it destroys nothing. */
  deleteOwn(userId: string): Promise<void>;
  /** Platform admin only. The one way back in, and it is always audited. */
  restore(adminId: string, userId: string, reason: string): Promise<void>;
}

export interface AccountLifecycleDependencies {
  readonly users: UserRepository;
  readonly audit: PlatformAuditService;
  readonly memberships: CompanyMembershipRepository;
  readonly tasks: TaskRepository;
  readonly refreshTokens: RefreshTokenRepository;
}

/**
 * Account deletion is a RECOVERABLE ACCOUNT STATE, never a physical delete.
 *
 * Nothing is cascaded and nothing is erased: the user row, and every project, task, message,
 * report and audit reference to it, stay exactly as they are, so a deleted account still renders
 * through the existing former-participant behaviour and can be restored later.
 *
 * What stops is access. `PARTICIPATING_STATUSES` excludes `deleted`, so `isSessionPermitted`
 * refuses Login, Refresh and every protected route for as long as the state lasts.
 */
export const createAccountLifecycleService = ({
  users,
  audit,
  memberships,
  tasks,
  refreshTokens,
}: AccountLifecycleDependencies): AccountLifecycleService => ({
  async deleteOwn(userId) {
    if (!Types.ObjectId.isValid(userId)) throw accountRestoreNotApplicable();

    const id = new Types.ObjectId(userId);

    // The open D8 question — what happens to active commitments — is preserved by refusing the
    // request while any exist, never by choosing an answer here.
    const membership = await memberships.findCurrentByUser(userId);
    if (membership !== null && membership.standing === 'employee') throw accountInCompany();
    if (membership !== null && membership.standing === 'owner') {
      // A sole owner strands nobody; an owner whose company still holds other current members does.
      const members = await memberships.listByCompany(membership.company);
      const others = members.filter(
        (row) =>
          row.user !== null &&
          row.user.toString() !== userId &&
          (CURRENT_MEMBERSHIP_STATUSES as readonly string[]).includes(row.status),
      );
      if (others.length > 0) throw accountOwnsCompany();
    }
    if ((await tasks.countUnfinishedResponsibilities(id)) > 0) throw accountHasActiveWork();

    // Filtered on the state being left, so a second submission is refused rather than re-applied.
    if (!(await users.transitionStatus(id, 'active', 'deleted'))) throw accountAlreadyDeleted();

    await refreshTokens.revokeAllForUser(id);

    await audit.record({
      actorId: userId,
      action: 'account.deleted',
      targetType: 'user',
      targetId: userId,
      metadata: { selfService: true },
    });
  },

  async restore(adminId, userId, reason) {
    if (!Types.ObjectId.isValid(userId)) throw accountRestoreNotApplicable();

    const id = new Types.ObjectId(userId);
    const account = await users.findModerationSubject(userId);
    if (account === null) throw accountRestoreNotApplicable();

    if (!(await users.transitionStatus(id, 'deleted', 'active'))) throw accountNotDeleted();

    await audit.record({
      actorId: adminId,
      action: 'account.restored',
      targetType: 'user',
      targetId: userId,
      metadata: { reason },
    });
  },
});
