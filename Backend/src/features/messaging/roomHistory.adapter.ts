import { auditRepository } from '../coordination/audit.repository.js';
import type { RoomHistoryPort } from '../projectmembers/roomHistory.port.js';
import { userRepository } from '../users/user.repository.js';
import { messagingRepository } from './messaging.repository.js';

/**
 * Executes the removal-time keep-or-delete choice. Delete is the moderation tombstone, never
 * erasure, and a kept message is skipped by the repository filter itself. Either answer is
 * audited with the actor and the person removed.
 */
export const createRoomHistoryAdapter = (): RoomHistoryPort => ({
  async applyRemovalDecision(actor, project, removedUser, decision) {
    const room = await messagingRepository.findProjectRoom(project);

    const removedCount =
      decision === 'delete' && room !== null
        ? await messagingRepository.removeAllFromSender(room._id, removedUser, actor)
        : 0;

    const names = await userRepository.findDisplayNames([actor]);
    await auditRepository.append([
      {
        project,
        actor,
        actorName: names.get(actor.toString()) ?? '',
        action: 'room.messages_removal_decision',
        parties: [removedUser],
        details: { decision, removedCount },
        partyDetails: {},
      },
    ]);
  },
});
