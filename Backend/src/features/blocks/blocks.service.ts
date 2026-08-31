import type { Types } from 'mongoose';

import type { UserRepository } from '../users/user.repository.js';
import type { BlockRepository } from './block.repository.js';
import { alreadyBlocked, blockNotFound, blockTargetNotFound, cannotBlockSelf } from './block.errors.js';

export interface BlockedPerson {
  readonly userId: string;
  readonly blockedAt: Date;
}

export interface BlocksService {
  block(actorId: string, targetUserId: string): Promise<void>;
  unblock(actorId: string, targetUserId: string): Promise<void>;
  /** Everyone hidden from this viewer's discovery, in either direction. */
  hiddenUserIdsFor(userId: string): Promise<Types.ObjectId[]>;
  listMyBlocks(userId: string): Promise<BlockedPerson[]>;
}

export interface BlocksDependencies {
  readonly blocks: BlockRepository;
  readonly users: UserRepository;
}

export const createBlocksService = ({ blocks, users }: BlocksDependencies): BlocksService => ({
  async block(actorId, targetUserId) {
    if (actorId === targetUserId) throw cannotBlockSelf();
    if ((await users.findById(targetUserId)) === null) throw blockTargetNotFound();

    const created = await blocks.create(actorId, targetUserId);
    if (created === null) throw alreadyBlocked();
  },

  async unblock(actorId, targetUserId) {
    const removed = await blocks.remove(actorId, targetUserId);
    if (!removed) throw blockNotFound();
  },

  async hiddenUserIdsFor(userId) {
    return blocks.findHiddenUserIds(userId);
  },

  async listMyBlocks(userId) {
    const rows = await blocks.listCreatedBy(userId);
    return rows.map((row) => ({
      userId: row.blockedUserId.toString(),
      blockedAt: row.createdAt,
    }));
  },
});