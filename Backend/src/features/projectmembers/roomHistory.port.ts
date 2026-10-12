import type { Types } from 'mongoose';

export type RoomMessagesDecision = 'keep' | 'delete';

/** The removal-time choice over the removed member's Project-Room messages, rule (f). */
export interface RoomHistoryPort {
  applyRemovalDecision(
    actor: Types.ObjectId,
    project: Types.ObjectId,
    removedUser: Types.ObjectId,
    decision: RoomMessagesDecision,
  ): Promise<void>;
}
