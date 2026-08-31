import { Types } from 'mongoose';

import { AppError } from '../../shared/errors.js';
import type { PlatformAuditService } from '../moderation/platformAudit.service.js';
import type { UserRepository } from './user.repository.js';

export const accountAlreadyDeleted = (): AppError =>
  new AppError('This account is already deleted.', 409, 'ACCOUNT_ALREADY_DELETED');

export const accountNotDeleted = (): AppError =>
  new AppError('This account is not deleted.', 409, 'ACCOUNT_NOT_DELETED');

export const accountRestoreNotApplicable = (): AppError =>
  new AppError('That account cannot be restored.', 404, 'ACCOUNT_RESTORE_NOT_APPLICABLE');

export interface AccountLifecycleService {
  /** The account's own holder, closing it. Recoverable, and it destroys nothing. */
  deleteOwn(userId: string): Promise<void>;
  /** Platform admin only. The one way back in, and it is always audited. */
  restore(adminId: string, userId: string, reason: string): Promise<void>;
}

export interface AccountLifecycleDependencies {
  readonly users: UserRepository;
  readonly audit: PlatformAuditService;
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
}: AccountLifecycleDependencies): AccountLifecycleService => ({
  async deleteOwn(userId) {
    if (!Types.ObjectId.isValid(userId)) throw accountRestoreNotApplicable();

    const id = new Types.ObjectId(userId);

    // Filtered on the state being left, so a second submission is refused rather than re-applied.
    if (!(await users.transitionStatus(id, 'active', 'deleted'))) throw accountAlreadyDeleted();

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
