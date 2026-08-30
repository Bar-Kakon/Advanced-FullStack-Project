import type { ProposalMarkerPort } from '../tasks/proposals.port.js';
import type { RescheduleRequestPort } from '../tasks/reschedule.port.js';
import type { CoordinationService } from './coordination.service.js';

export const createProposalMarkerAdapter = (service: CoordinationService): ProposalMarkerPort => ({
  available: true,
  async pendingFor(userId, taskIds) {
    if (taskIds.length === 0) return new Map<string, boolean>();
    return service.pendingFor(userId, taskIds);
  },
});

export const createReschedulePortAdapter = (service: CoordinationService): RescheduleRequestPort => ({
  available: true,
  async impactOf(taskId) {
    return service.impactCountFor(taskId);
  },
});
