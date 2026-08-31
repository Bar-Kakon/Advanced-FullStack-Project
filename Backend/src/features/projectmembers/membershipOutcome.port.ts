import type { Types } from 'mongoose';

export interface MembershipOutcomeListener {
  onAccepted(userId: string, project: Types.ObjectId): Promise<void>;
  onDeclined(userId: string, project: Types.ObjectId): Promise<void>;
}

export const ignoreMembershipOutcomes: MembershipOutcomeListener = {
  async onAccepted() {
    return undefined;
  },
  async onDeclined() {
    return undefined;
  },
};