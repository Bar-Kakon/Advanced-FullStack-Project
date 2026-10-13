import { Types } from 'mongoose';

import { AppError } from '../../shared/errors.js';
import type { RefreshTokenRepository } from '../auth/refreshToken.repository.js';
import type { CompanyMembershipRepository } from '../companies/companyMembership.repository.js';
import type { PlatformAuditService } from '../moderation/platformAudit.service.js';
import { RECOVERY_WINDOW_DAYS } from './user.model.js';
import type { UserRepository } from './user.repository.js';

const DAY_MS = 86_400_000;

/** The earliest `deletedAt` that is still inside the recovery window right now. */
export const recoveryWindowFloor = (): Date =>
  new Date(Date.now() - RECOVERY_WINDOW_DAYS * DAY_MS);

export const accountAlreadyDeleted = (): AppError =>
  new AppError('This account is already deleted.', 409, 'ACCOUNT_ALREADY_DELETED');

export const accountNotDeleted = (): AppError =>
  new AppError('This account is not deleted.', 409, 'ACCOUNT_NOT_DELETED');

export const accountRestoreNotApplicable = (): AppError =>
  new AppError('That account cannot be restored.', 404, 'ACCOUNT_RESTORE_NOT_APPLICABLE');

export const accountInCompany = (): AppError =>
  new AppError('Leave the company before closing the account.', 409, 'ACCOUNT_IN_COMPANY');

export const accountRestoreExpired = (): AppError =>
  new AppError('The 60-day recovery window has passed.', 409, 'ACCOUNT_RESTORE_EXPIRED');

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
  refreshTokens,
}: AccountLifecycleDependencies): AccountLifecycleService => ({
  async deleteOwn(userId) {
    if (!Types.ObjectId.isValid(userId)) throw accountRestoreNotApplicable();

    const id = new Types.ObjectId(userId);

    // Active work never blocks closure — "ההתחייבות ממשיכה מחוץ למערכת" — and neither does
    // owning a company: the company derives its inactive state from this very deletion, nothing
    // is transferred, and restoring the owner reactivates it. Only an EMPLOYEE is asked to end
    // the employment relationship first, because the self-serve leave exists for exactly that.
    const membership = await memberships.findCurrentByUser(userId);
    if (membership !== null && membership.standing === 'employee') throw accountInCompany();

    // Filtered on the state being left, so a second submission is refused rather than re-applied.
    // The same write stamps `deletedAt`, which is what the 60-day window is measured from.
    if (!(await users.markDeleted(id))) throw accountAlreadyDeleted();

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

    const life = await users.findLifecycleState(userId);
    if (life === null || life.status !== 'deleted') throw accountNotDeleted();
    if (
      life.anonymizedAt !== undefined ||
      life.deletedAt === undefined ||
      life.deletedAt.getTime() < recoveryWindowFloor().getTime()
    ) {
      throw accountRestoreExpired();
    }

    // The filter re-proves the window, so a sweep racing this restore loses cleanly either way.
    if (!(await users.restoreWithinWindow(id, recoveryWindowFloor()))) throw accountNotDeleted();

    await audit.record({
      actorId: adminId,
      action: 'account.restored',
      targetType: 'user',
      targetId: userId,
      metadata: { reason },
    });
  },
});
