import type { Types } from 'mongoose';

import type { ReportedMessagePort, ReportedMessageView } from '../moderation/reportedMessage.port.js';
import { messagingRepository } from './messaging.repository.js';

/**
 * What administrative review may see of a reported message: the stored content and where it sits.
 * The row is never destroyed by deletion or removal, so the view survives both.
 */
export const createReportedMessageAdapter = (): ReportedMessagePort => ({
  async findForModeration(messageId: Types.ObjectId): Promise<ReportedMessageView | null> {
    const message = await messagingRepository.findMessage(messageId.toString());
    if (message === null) return null;

    const conversation = await messagingRepository.findById(message.conversation.toString());

    return {
      body: message.body ?? null,
      sender: message.sender,
      sentAt: message.createdAt,
      conversationId: message.conversation,
      conversationKind: conversation?.kind ?? null,
      projectId: conversation?.project ?? null,
      removed: message.removedAt !== undefined,
      deleted: message.deletedAt !== undefined,
      kept: message.keptAt !== undefined,
    };
  },
});
