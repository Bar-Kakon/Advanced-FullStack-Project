import type { BlocksService } from '../blocks/blocks.service.js';
import type { UserRepository } from '../users/user.repository.js';
import type { ConnectionRepository } from './connection.repository.js';
import {
  cannotConnectToSelf,
  connectionAlreadyExists,
  connectionBlocked,
  connectionTargetNotFound,
  noPendingRequest,
} from './connection.errors.js';

export interface ConnectionsService {
  request(actorId: string, targetUserId: string): Promise<void>;
  accept(actorId: string, requesterUserId: string): Promise<void>;
  decline(actorId: string, requesterUserId: string): Promise<void>;
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
});