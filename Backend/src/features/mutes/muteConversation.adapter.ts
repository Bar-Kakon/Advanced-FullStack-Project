import { Types } from 'mongoose';

import { conversationNotFound } from '../messaging/messaging.errors.js';
import { messagingRepository } from '../messaging/messaging.repository.js';
import { projectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import type { MuteConversationReader } from './mute.service.js';

/**
 * The narrow read the mute domain needs of messaging: may this person mute this conversation.
 *
 * It repeats the messaging reachability rule rather than importing the messaging service, so the
 * two modules stay uncoupled — mutes depend on an interface they declare, not on the whole
 * messaging composition root.
 */
export const muteConversationReader: MuteConversationReader = {
  async reachable(userId, conversationId) {
    const conversation = await messagingRepository.findById(conversationId);
    if (conversation === null) throw conversationNotFound();

    const permitted =
      conversation.kind === 'project_room'
        ? conversation.project !== undefined &&
          (await projectAccessRepository.findActiveMembership(
            conversation.project,
            new Types.ObjectId(userId),
          )) !== null
        : conversation.participants.some((participant) => participant.toString() === userId);

    if (!permitted) throw conversationNotFound();

    return { _id: conversation._id };
  },
};
