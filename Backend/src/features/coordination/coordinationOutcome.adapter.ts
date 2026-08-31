import { Types } from 'mongoose';

import type { CoordinationOutcomePort } from '../flexibility/coordinationOutcome.port.js';
import type { CoordinationEvent, CoordinationOutcome } from '../flexibility/flexibility.js';
import { daysBetween } from '../projects/projectDates.js';
import type { HandoffRecord } from './handoff.model.js';
import type { HandoffRepository } from './handoff.repository.js';
import type { ProposalItemRecord, ProposalRecord } from './proposal.model.js';
import type { ProposalRepository } from './proposal.repository.js';

const carriedAlternative = (proposal: ProposalRecord): boolean =>
  proposal.changes.alternativeStart !== undefined || proposal.changes.alternativeDue !== undefined;

export const replacementCompleted = (
  proposal: ProposalRecord,
  item: ProposalItemRecord,
  handoffs: readonly HandoffRecord[],
): boolean => {
  const resolvedAt = proposal.resolution?.at;
  if (resolvedAt === undefined) return false;

  return handoffs.some(
    (handoff) =>
      handoff.state === 'accepted' &&
      handoff.task.equals(item.task) &&
      handoff.from.equals(item.respondent) &&
      handoff.decidedAt !== undefined &&
      handoff.decidedAt.getTime() >= resolvedAt.getTime(),
  );
};

export const outcomeOf = (
  proposal: ProposalRecord,
  item: ProposalItemRecord,
  handoffs: readonly HandoffRecord[] = [],
): CoordinationOutcome | null => {
  if (item.excluded) return null;
  if (item.resolution === 'replaced') {
    return replacementCompleted(proposal, item, handoffs) ? 'unresolved_replaced' : null;
  }
  if (item.resolution === 'counter' && item.response === 'countered') return 'counter_agreed';
  if (item.resolution === 'other' && item.response === 'other_proposed') return 'other_solution_agreed';

  if (item.response === 'declined') {
    return item.declineReason === undefined ? null : 'declined_justified';
  }
  if (item.resolution === 'proposed' && item.response === 'accepted') {
    return carriedAlternative(proposal) ? 'alternative_agreed' : 'accepted';
  }
  return null;
};

const noticeDaysFor = (proposal: ProposalRecord, item: ProposalItemRecord): number | null => {
  const at = proposal.resolution?.at;
  if (at === undefined) return null;
  return Math.max(0, daysBetween(at, item.currentStart));
};

export const createCoordinationOutcomeAdapter = (
  proposals: ProposalRepository,
  handoffs: HandoffRepository,
): CoordinationOutcomePort => ({
  available: true,

  async eventsFor(userId) {
    if (!Types.ObjectId.isValid(userId)) return [];

    const subject = new Types.ObjectId(userId);
    const resolved = await proposals.listResolvedForRespondent(subject);
    const accepted = await handoffs.listAcceptedFrom(subject);
    const events: CoordinationEvent[] = [];

    for (const proposal of resolved) {
      for (const item of proposal.items) {
        if (item.respondent.toString() !== userId) continue;

        const outcome = outcomeOf(proposal, item, accepted);
        if (outcome === null) continue;

        events.push({
          dimension: 'schedule',
          outcome,
          requestedByCounterparty: proposal.requestedBy.toString() !== userId,
          noticeDays: noticeDaysFor(proposal, item),
        });
      }
    }
    return events;
  },
});
