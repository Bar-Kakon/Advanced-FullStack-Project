import { Types } from 'mongoose';

import type { BlocksService } from '../blocks/blocks.service.js';
import type { UserRepository } from '../users/user.repository.js';
import { REACTIVATABLE_CONNECTION_STATUSES } from './connection.model.js';
import type { ConnectionRepository } from './connection.repository.js';
import {
  cannotConnectToSelf,
  connectionAlreadyExists,
  connectionBlocked,
  connectionTargetNotFound,
  noPendingRequest,
  notConnected,
} from './connection.errors.js';

export interface ConnectionsService {
  request(actorId: string, targetUserId: string): Promise<void>;
  accept(actorId: string, requesterUserId: string): Promise<void>;
  decline(actorId: string, requesterUserId: string): Promise<void>;
  /** D17: an accepted connection ends as `removed`, keeping the row. */
  remove(actorId: string, otherUserId: string): Promise<void>;
  /** D17: the requester cancels their own pending request as `withdrawn`. */
  withdraw(actorId: string, targetUserId: string): Promise<void>;
}

export interface ConnectionsDependencies {
  readonly connections: ConnectionRepository;
  readonly users: UserRepository;
  readonly blocks: BlocksService;
}

export const createConnectionsService = ({
  connections,
  users,
  blocks,
}: ConnectionsDependencies): ConnectionsService => ({
  async request(actorId, targetUserId) {
    if (actorId === targetUserId) throw cannotConnectToSelf();
    if ((await users.findById(targetUserId)) === null) throw connectionTargetNotFound();

    // A block in either direction hides the person, so the request never reaches the collection.
    const hidden = await blocks.hiddenUserIdsFor(actorId);
    if (hidden.some((id) => id.toString() === targetUserId)) throw connectionBlocked();

    const existing = await connections.findByPair(actorId, targetUserId);
    if (existing !== null) {
      // The pair is unique, so a fresh request reuses the torn-down row rather than inserting one.
      if (!REACTIVATABLE_CONNECTION_STATUSES.includes(existing.status)) throw connectionAlreadyExists();

      const reactivated = await connections.reactivate(
        existing._id,
        new Types.ObjectId(actorId),
        new Types.ObjectId(targetUserId),
      );
      if (!reactivated) throw connectionAlreadyExists();
      return;
    }

    const created = await connections.create(actorId, targetUserId);
    if (created === null) throw connectionAlreadyExists();
  },

  async accept(actorId, requesterUserId) {
    const edge = await connections.findByPair(actorId, requesterUserId);
    if (edge === null || edge.status !== 'pending' || edge.recipient.toString() !== actorId) {
      throw noPendingRequest();
    }

    if (!(await connections.accept(edge._id, edge.recipient))) throw noPendingRequest();
  },

  async decline(actorId, requesterUserId) {
    const edge = await connections.findByPair(actorId, requesterUserId);
    if (edge === null || edge.status !== 'pending' || edge.recipient.toString() !== actorId) {
      throw noPendingRequest();
    }

    if (!(await connections.decline(edge._id, edge.recipient))) throw noPendingRequest();
  },

  async remove(actorId, otherUserId) {
    const edge = await connections.findByPair(actorId, otherUserId);
    if (edge === null || edge.status !== 'accepted') throw notConnected();

    if (!(await connections.remove(edge._id, new Types.ObjectId(actorId)))) throw notConnected();
  },

  async withdraw(actorId, targetUserId) {
    const edge = await connections.findByPair(actorId, targetUserId);
    if (edge === null || edge.status !== 'pending' || edge.requester.toString() !== actorId) {
      throw noPendingRequest();
    }

    if (!(await connections.withdraw(edge._id, edge.requester))) throw noPendingRequest();
  },
});