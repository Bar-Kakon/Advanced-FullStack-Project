import type { Types } from 'mongoose';

/**
 * Whether a recognized Work Commitment was EVER established between two people: a binding work
 * agreement both parties accepted. History persists by owner decision — completion, cancellation
 * or expiry of the work never revokes it. What the established default then exposes remains the
 * number owner's own setting to decide.
 */
export interface WorkCommitmentPort {
  wasEstablishedBetween(a: Types.ObjectId, b: Types.ObjectId): Promise<boolean>;
}
