import type { Types } from 'mongoose';

import type { ConnectionRepository } from './connection.repository.js';

/**
 * The four states Browse renders. `blocked` is not among them: a blocked person is excluded from
 * discovery entirely, so there is no card to put a fifth state on.
 */
export const RELATIONSHIP_STATES = ['none', 'outgoing_request', 'incoming_request', 'connected'] as const;
export type RelationshipState = (typeof RELATIONSHIP_STATES)[number];

export interface RelationshipService {
  /** One read for a whole result page, so a card never costs a query of its own. */
  forCandidates(viewerId: string, candidateIds: readonly Types.ObjectId[]): Promise<Map<string, RelationshipState>>;
  between(viewerId: string, otherUserId: string): Promise<RelationshipState>;
}

export interface RelationshipDependencies {
  readonly connections: ConnectionRepository;
}

export const createRelationshipService = ({
  connections,
}: RelationshipDependencies): RelationshipService => {
  const build = async (viewerId: string): Promise<Map<string, RelationshipState>> => {
    const edges = await connections.listForUser(viewerId);
    const states = new Map<string, RelationshipState>();

    for (const edge of edges) {
      const viewerIsRequester = edge.requester.toString() === viewerId;
      const other = viewerIsRequester ? edge.recipient.toString() : edge.requester.toString();

      if (edge.status === 'accepted') states.set(other, 'connected');
      else if (edge.status === 'pending') {
        states.set(other, viewerIsRequester ? 'outgoing_request' : 'incoming_request');
      }
      // A declined edge leaves no state on a Browse card: it reads as no relationship.
    }

    return states;
  };

  return {
    async forCandidates(viewerId, candidateIds) {
      const all = await build(viewerId);
      const scoped = new Map<string, RelationshipState>();

      for (const id of candidateIds) {
        scoped.set(id.toString(), all.get(id.toString()) ?? 'none');
      }

      return scoped;
    },

    async between(viewerId, otherUserId) {
      return (await build(viewerId)).get(otherUserId) ?? 'none';
    },
  };
};