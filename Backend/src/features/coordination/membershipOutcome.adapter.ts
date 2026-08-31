import type { MembershipOutcomeListener } from '../projectmembers/membershipOutcome.port.js';
import type { CoordinationService } from './coordination.service.js';

export const responsibilityTransferListener = (
  service: CoordinationService,
): MembershipOutcomeListener => ({
  async onAccepted(userId, project) {
    await service.completeAfterMembership(userId, project.toString());
  },
  async onDeclined(userId, project) {
    await service.abandonAfterMembershipDeclined(userId, project.toString());
  },
});