import { Types } from 'mongoose';

import { connectionRepository } from '../connections/connection.repository.js';
import { messagingRepository } from '../messaging/messaging.repository.js';
import { projectAccessRepository } from '../projectaccess/projectAccess.repository.js';
import type { NotificationRecord } from './notification.model.js';

/**
 * What a notification row is NOW, not what it was when written.
 *
 * `required` — the underlying request still waits on this viewer. `resolved` — it once did and no
 * longer does. `none` — information that never asked for anything. `null` — a type this resolver
 * deliberately does not judge, so the screen keeps its existing behavior for it.
 */
export type NotificationAction = 'required' | 'resolved' | 'none' | null;

/** Status updates by owner decision: shown, never actionable, never a navigation target. */
const INFORMATIONAL_TYPES = new Set([
  'connection.accepted',
  'connection.declined',
  'agreement.answered',
  'company.employee_left',
  'project.cancelled',
]);

export interface NotificationActionabilityService {
  resolve(viewerId: string, rows: readonly NotificationRecord[]): Promise<Map<string, NotificationAction>>;
}

/**
 * Reads the AUTHORITATIVE entity behind each actionable row at request time — the conversation's
 * request state, the live agreement, the connection edge, the invited membership — so acceptance,
 * rejection, a re-ask, another tab or another screen all change the answer without any row being
 * rewritten. A legacy row whose entity cannot be identified answers `resolved`: a stale action is
 * exactly the defect this exists to close, so uncertainty never renders a button.
 */
export const notificationActionabilityService: NotificationActionabilityService = {
  async resolve(viewerId, rows) {
    const out = new Map<string, NotificationAction>();

    for (const row of rows) {
      const id = row._id.toString();

      if (INFORMATIONAL_TYPES.has(row.type)) {
        out.set(id, 'none');
        continue;
      }

      if (row.type === 'message.request_received') {
        const conversation =
          row.conversation === undefined
            ? null
            : await messagingRepository.findById(row.conversation.toString());
        out.set(
          id,
          conversation?.request?.state === 'pending' &&
            conversation.request.requestedBy.toString() !== viewerId
            ? 'required'
            : 'resolved',
        );
        continue;
      }

      if (row.type === 'agreement.received') {
        const open =
          row.conversation !== undefined &&
          (await messagingRepository.hasProposedAgreementAwaiting(
            row.conversation,
            new Types.ObjectId(viewerId),
          ));
        out.set(id, open ? 'required' : 'resolved');
        continue;
      }

      if (row.type === 'connection.request_received') {
        if (row.actor === undefined) {
          out.set(id, 'resolved');
          continue;
        }
        const edge = await connectionRepository.findByPair(viewerId, row.actor.toString());
        out.set(
          id,
          edge !== null && edge.status === 'pending' && edge.recipient.toString() === viewerId
            ? 'required'
            : 'resolved',
        );
        continue;
      }

      if (row.type === 'project.invitation') {
        const membership =
          row.project === undefined
            ? null
            : await projectAccessRepository.findMembership(row.project, new Types.ObjectId(viewerId));
        out.set(id, membership?.status === 'invited' ? 'required' : 'resolved');
        continue;
      }

      out.set(id, null);
    }

    return out;
  },
};
